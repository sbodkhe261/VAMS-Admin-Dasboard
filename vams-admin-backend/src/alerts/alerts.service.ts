import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateManualAlertDto } from './dto/create-manual-alert.dto';
import { Severity } from '@prisma/client';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  async createManualAlert(companyId: string, performedByUserId: string, dto: CreateManualAlertDto) {
    const admin = await this.prisma.user.findUnique({ where: { id: performedByUserId } });
    if (!admin) throw new NotFoundException('Admin profile not found');

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company tenant not found');

    // Resolve Alert Definition
    const alertDef = await this.prisma.alertDefinition.findFirst({
      where: { id: dto.alertDefinitionId, companyId },
    });
    if (!alertDef) throw new NotFoundException('Alert definition template not found');

    // Auto-resolve assignee details and severity from definition, allowing overrides
    let assignedToUserId = dto.assignedToUserId || alertDef.primaryAssigneeId;
    let assignedToRole = dto.assignedToRole;
    let primaryUser: any = null;

    if (assignedToUserId) {
      primaryUser = await this.prisma.user.findUnique({ where: { id: assignedToUserId } });
      if (!assignedToRole && primaryUser) {
        assignedToRole = primaryUser.role;
      }
    }
    if (!assignedToRole) {
      assignedToRole = 'WORKER';
    }

    const severity = dto.severity || alertDef.severity;

    // 1. Resolve or create defectId via raw SQL query on the shared database BEFORE sending webhook
    let defectId: string | null = null;
    const defects: any = await this.prisma.$queryRawUnsafe(
      `SELECT id FROM defect_masters WHERE "companyId" = $1 AND name ILIKE $2 LIMIT 1`,
      companyId,
      alertDef.alertId || alertDef.name
    );

    if (defects && defects.length > 0) {
      defectId = defects[0].id;
    } else {
      const crypto = require('crypto');
      const newDefectId = crypto.randomUUID();
      let soundProfileVal = 'MEDIUM';
      if (severity === 'CRITICAL' || severity === 'EMERGENCY') {
        soundProfileVal = 'CRITICAL';
      } else if (severity === 'HIGH') {
        soundProfileVal = 'ALERT';
      }

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO defect_masters (id, name, category, severity, "defaultAssigneeRole", "ownerVisible", "soundProfile", active, "companyId", "createdAt", "updatedAt")
         VALUES ($1, $2, 'Manual Dispatch', CAST($3 AS "Severity"), CAST('WORKER' AS "UserRole"), true, $4, true, $5, NOW(), NOW())`,
        newDefectId,
        alertDef.alertId || alertDef.name,
        severity,
        soundProfileVal,
        companyId
      );
      defectId = newDefectId;
    }

    // 2. Perform direct database insertion first (locally)
    const alert = await this.prisma.$transaction(async (tx) => {
      const newAlert = await tx.alert.create({
        data: {
          vin: dto.vin || null,
          companyId,
          defectId: defectId!,
          defectName: alertDef.alertId || alertDef.name,
          alertDefinitionId: alertDef.id,
          severity: severity as any,
          status: 'OPEN',
          assignedToUserId,
          assignedToRole: assignedToRole as any,
          createdById: performedByUserId,
          isManual: true,
        },
      });

      // Create initial active AlertAssignment record
      await tx.alertAssignment.create({
        data: {
          alertId: newAlert.id,
          severity: severity as any,
          assignedToId: assignedToUserId,
          assignedAt: new Date(),
          notifiedAt: new Date(),
          seenAt: null,
          reminderCount: 0,
          escalationLevel: 0,
          status: 'OPEN',
        },
      });

      await tx.alertAssignmentHistory.create({
        data: {
          alertId: newAlert.id,
          assignedByUserId: performedByUserId,
          assignedToUserId,
          assignedToRole: assignedToRole as any,
          notes: dto.notes || 'Manually created & assigned from Admin Dashboard',
        },
      });

      await tx.defectResolutionTimeline.create({
        data: {
          alertId: newAlert.id,
          actionType: 'CREATED',
          performedByUserId,
          details: `Manual defect created by ${admin.name} (${admin.role}). Assigned to: User ID ${assignedToUserId} (Primary Assignee). Notes: ${dto.notes || 'None'}`,
        },
      });

      // Direct raw notification insert for local sync
      const targetUsers = await tx.user.findMany({ where: { companyId, isActive: true } });

      for (const targetUser of targetUsers) {
        const crypto = require('crypto');
        const isYou = targetUser.id === assignedToUserId;
        await tx.$executeRawUnsafe(
          `INSERT INTO notifications (id, "userId", "companyId", "alertId", title, message, channel, "isRead", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, 'IN_APP', false, NOW())`,
          crypto.randomUUID(),
          targetUser.id,
          companyId,
          newAlert.id,
          `CRITICAL ALERT: ${alertDef.name}`,
          `New defect '${alertDef.name}' is assigned to ${isYou ? 'you' : primaryUser?.name || 'Operator'}.`
        );
      }

      return newAlert;
    });

    // 3. Trigger VAMS core backend event ingestion asynchronously in the background
    const coreUrl = process.env.CORE_BACKEND_URL || 'http://127.0.0.1:3000/api/v1';
    (async () => {
      try {
        await (global as any).fetch(`${coreUrl}/alerts/event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'admin-portal',
            event_type: 'DEFECT_CREATED',
            companyId,
            vin: dto.vin || null,
            defectName: alertDef.alertId || alertDef.name,
            alertDefinitionId: alertDef.id,
            alertId: alert.id,
            assignedToUserId: assignedToUserId || undefined,
            assignedToRole: assignedToRole || undefined,
            severity,
            message: dto.notes || undefined,
          }),
        });
      } catch (fetchErr: any) {
        console.warn('[NOTIFICATION SYNC WARNING] Failed to trigger core alerts engine in background:', fetchErr.message);
      }
    })();

    console.log(`[WHATSAPP & PUSH] Dispatched manual defect creation. Syncing notifications via core engine in background.`);

    return alert;
  }

  async getAdvancedAnalytics(companyId: string) {
    const isGlobal = !companyId || companyId === 'all';

    // 1. Fetch companies list
    const companies = await this.prisma.company.findMany({
      where: isGlobal ? {} : { id: companyId },
      include: {
        settings: true,
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          }
        },
        alerts: {
          include: {
            assignedToUser: {
              select: {
                id: true,
                name: true,
                role: true,
              }
            },
            assignments: true,
            resolution: true,
            timeline: true,
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // 2. Compute metrics
    const alerts = isGlobal 
      ? await this.prisma.alert.findMany({
          include: { assignments: true, resolution: true, timeline: true }
        })
      : await this.prisma.alert.findMany({
          where: { companyId },
          include: { assignments: true, resolution: true, timeline: true }
        });

    const totalCount = alerts.length;
    const openCount = alerts.filter(a => a.status === 'OPEN' || a.status === 'IN_PROGRESS').length;
    const resolvedCount = alerts.filter(a => a.status === 'RESOLVED').length;
    const reopenedCount = alerts.filter(a => a.status === 'REOPENED').length;
    const reassignCount = alerts.reduce((acc, curr) => acc + curr.assignments.length, 0);

    const severityCount = alerts.filter(a => a.status !== 'RESOLVED').reduce((acc, curr) => {
      acc[curr.severity] = (acc[curr.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 4. Resolve userPerformance list
    const allUsers = isGlobal 
      ? await this.prisma.user.findMany({
          select: { id: true, name: true, email: true, role: true, isActive: true, companyId: true, company: { select: { name: true } } }
        })
      : await this.prisma.user.findMany({
          where: { companyId },
          select: { id: true, name: true, email: true, role: true, isActive: true, companyId: true, company: { select: { name: true } } }
        });

    const userIds = allUsers.map(u => u.id);
    const companyAlertIds = alerts.map(a => a.id);

    const [allResolutions, allReopenedEvents, allReassignments] = await Promise.all([
      this.prisma.resolution.findMany({
        where: isGlobal ? {} : { resolvedByUserId: { in: userIds } },
      }),
      this.prisma.defectResolutionTimeline.findMany({
        where: {
          actionType: 'REOPENED',
          ...(isGlobal ? {} : { alertId: { in: companyAlertIds } }),
        },
      }),
      this.prisma.alertAssignmentHistory.findMany({
        where: isGlobal ? {} : { assignedByUserId: { in: userIds } },
      }),
    ]);

    // 3. Aggregate detailed company workspaces
    const companiesData = companies.map((c) => {
      const companyUsers = c.users.map((u) => {
        const currentlyAssigned = c.alerts.filter(a => a.assignedToUserId === u.id && a.status !== 'RESOLVED').length;
        
        const myResolutions = allResolutions.filter(r => r.resolvedByUserId === u.id);
        const resolvedCount = myResolutions.length;
        const myResolutionsAlertIds = myResolutions.map(r => r.alertId);
        
        const reopenedCount = allReopenedEvents.filter(evt => myResolutionsAlertIds.includes(evt.alertId)).length;
        const reassignedCount = allReassignments.filter(h => h.assignedByUserId === u.id).length;

        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          currentlyAssigned,
          resolvedCount,
          reopenedCount,
          reassignedCount,
        };
      });

      return {
        id: c.id,
        name: c.name,
        isActive: c.isActive,
        createdAt: c.createdAt,
        settings: c.settings,
        users: companyUsers,
        alerts: c.alerts.map(a => ({
          id: a.id,
          vin: a.vin,
          defectName: a.defectName,
          severity: a.severity,
          status: a.status,
          assignedToUserId: a.assignedToUserId,
          assignedToUser: a.assignedToUser,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        })),
      };
    });

    const userPerformance = allUsers.map((u) => {
      const currentlyAssigned = alerts.filter(a => a.assignedToUserId === u.id && a.status !== 'RESOLVED').length;
      
      const myResolutions = allResolutions.filter(r => r.resolvedByUserId === u.id);
      const resolvedCount = myResolutions.length;
      const myResolutionsAlertIds = myResolutions.map(r => r.alertId);
      
      const reopenedCount = allReopenedEvents.filter(evt => myResolutionsAlertIds.includes(evt.alertId)).length;
      const reassignedCount = allReassignments.filter(h => h.assignedByUserId === u.id).length;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        companyId: u.companyId,
        companyName: u.company.name,
        currentlyAssigned,
        resolvedCount,
        reopenedCount,
        reassignedCount,
      };
    });

    const auditTimeline = await this.prisma.defectResolutionTimeline.findMany({
      where: isGlobal ? {} : { alert: { companyId } },
      include: {
        performedByUser: {
          select: { name: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      summary: {
        totalDefects: totalCount,
        openDefects: openCount,
        resolvedDefects: resolvedCount,
        reopenedDefects: reopenedCount,
        reassignedDefects: reassignCount,
      },
      severityDistribution: severityCount,
      categoryDistribution: {},
      userPerformance,
      companiesData,
      auditTimeline: auditTimeline.map(evt => ({
        id: evt.id,
        alertId: evt.alertId,
        actionType: evt.actionType,
        details: evt.details,
        createdAt: evt.createdAt,
        operator: evt.performedByUser ? `${evt.performedByUser.name} (${evt.performedByUser.role})` : 'SYSTEM',
      })),
    };
  }

  async findAll(companyId: string) {
    const isGlobal = !companyId || companyId === 'all';
    return this.prisma.alert.findMany({
      where: isGlobal ? {} : { companyId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(companyId: string, id: string) {
    const isGlobal = !companyId || companyId === 'all';
    const alert = await this.prisma.alert.findFirst({
      where: isGlobal ? { id } : { id, companyId },
      include: {
        assignments: true,
        timeline: {
          include: { performedByUser: { select: { name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        resolution: true,
      },
    });
    if (!alert) throw new NotFoundException('Alert not found');
    return alert;
  }

  // Alert Definitions CRUD
  async getDefinitions(companyId: string) {
    return this.prisma.alertDefinition.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDefinition(companyId: string, performedByUserId: string, dto: any) {
    const def = await this.prisma.alertDefinition.create({
      data: {
        companyId,
        alertId: dto.alertId,
        name: dto.name,
        definition: dto.definition || null,
        type: dto.type,
        severity: dto.severity,
        primaryAssigneeId: dto.primaryAssigneeId,
        escalationChain: dto.escalationChain || [],
        escalationTimeout: parseInt(dto.escalationTimeout, 10),
        criticalOverride: dto.criticalOverride || false,
        isActive: true,
      },
    });

    return def;
  }

  async updateDefinition(companyId: string, id: string, dto: any) {
    const existing = await this.prisma.alertDefinition.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Alert definition template not found');
    return this.prisma.alertDefinition.update({
      where: { id },
      data: {
        alertId: dto.alertId,
        name: dto.name,
        definition: dto.definition || null,
        type: dto.type,
        severity: dto.severity,
        primaryAssigneeId: dto.primaryAssigneeId,
        escalationChain: dto.escalationChain || [],
        escalationTimeout: parseInt(dto.escalationTimeout, 10),
        criticalOverride: dto.criticalOverride || false,
      },
    });
  }

  async deleteDefinition(companyId: string, id: string) {
    const existing = await this.prisma.alertDefinition.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Alert definition template not found');
    return this.prisma.alertDefinition.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async dispatchDefinition(companyId: string, performedByUserId: string, id: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: performedByUserId } });
    if (!admin) throw new NotFoundException('Admin profile not found');

    const alertDef = await this.prisma.alertDefinition.findFirst({
      where: { id, companyId },
    });
    if (!alertDef) throw new NotFoundException('Alert definition template not found');

    return this.createManualAlert(companyId, performedByUserId, {
      alertDefinitionId: alertDef.id,
      severity: alertDef.severity,
      assignedToUserId: alertDef.primaryAssigneeId || undefined,
      notes: `Dispatched template: ${alertDef.name}`,
    });
  }

  // Company Broadcasts
  async createBroadcast(companyId: string, sentById: string, dto: any) {
    const broadcast = await this.prisma.companyBroadcastLog.create({
      data: {
        companyId,
        title: dto.title,
        message: dto.message,
        sentById,
      },
    });

    const coreUrl = process.env.CORE_BACKEND_URL || 'http://127.0.0.1:3000/api/v1';
    
    // Dispatch webhook asynchronously in the background so the admin UI responds instantly
    (async () => {
      try {
        const response = await (global as any).fetch(`${coreUrl}/alerts/event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'admin-portal',
            event_type: 'BROADCAST',
            companyId,
            title: dto.title,
            message: dto.message,
            targetUserIds: dto.targetUserIds || undefined,
          }),
        });

        if (response.ok) {
          console.log(`[WHATSAPP & PUSH] Broadcast sent: ${dto.title} - ${dto.message}`);
        } else {
          const errorText = await response.text();
          console.warn('[BROADCAST SYNC WARNING] VAMS core alerts engine returned error:', errorText);
          await this.triggerBroadcastFallback(companyId, dto.title, dto.message, dto.targetUserIds);
        }
      } catch (err: any) {
        console.warn('Failed to send broadcast webhook to core backend. Running fallback:', err.message);
        await this.triggerBroadcastFallback(companyId, dto.title, dto.message, dto.targetUserIds);
      }
    })();

    return broadcast;
  }

  private async triggerBroadcastFallback(companyId: string, title: string, message: string, targetUserIds?: string[]) {
    try {
      const targetUsers = await this.prisma.user.findMany({
        where: {
          companyId,
          isActive: true,
          ...(targetUserIds && targetUserIds.length > 0 && { id: { in: targetUserIds } }),
        },
      });
      const crypto = require('crypto');
      for (const targetUser of targetUsers) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO notifications (id, "companyId", "userId", title, message, channel, "isRead", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6::"NotificationChannel", $7, NOW())`,
          crypto.randomUUID(),
          companyId,
          targetUser.id,
          title,
          message,
          'PUSH',
          false
        );
        await this.prisma.alertNotificationLog.create({
          data: {
            id: crypto.randomUUID(),
            alertId: 'BROADCAST',
            userId: targetUser.id,
            type: 'BROADCAST',
            message: message,
          },
        });
      }
    } catch (fallbackErr: any) {
      console.error('[BROADCAST FALLBACK ERROR] Failed to run database fallback:', fallbackErr.message);
    }
  }

  async getBroadcasts(companyId: string) {
    return this.prisma.companyBroadcastLog.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Proxy Alert Actions
  async takeoverAlert(userId: string, alertId: string) {
    const coreUrl = process.env.CORE_BACKEND_URL || 'http://127.0.0.1:3000/api/v1';
    const response = await (global as any).fetch(`${coreUrl}/alerts/${alertId}/takeover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (response.ok) {
      return response.json();
    }
    const text = await response.text();
    throw new BadRequestException(`Core takeover failed: ${text}`);
  }

  async resolveAlert(userId: string, alertId: string, reason: string) {
    const coreUrl = process.env.CORE_BACKEND_URL || 'http://127.0.0.1:3000/api/v1';
    const response = await (global as any).fetch(`${coreUrl}/alerts/${alertId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reason }),
    });
    if (response.ok) {
      return response.json();
    }
    const text = await response.text();
    throw new BadRequestException(`Core resolve failed: ${text}`);
  }

  async reopenAlert(userId: string, alertId: string) {
    const coreUrl = process.env.CORE_BACKEND_URL || 'http://127.0.0.1:3000/api/v1';
    const response = await (global as any).fetch(`${coreUrl}/alerts/${alertId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (response.ok) {
      return response.json();
    }
    const text = await response.text();
    throw new BadRequestException(`Core reopen failed: ${text}`);
  }

  async reassignAlert(userId: string, alertId: string, assignedToUserId: string) {
    const coreUrl = process.env.CORE_BACKEND_URL || 'http://127.0.0.1:3000/api/v1';
    const response = await (global as any).fetch(`${coreUrl}/alerts/${alertId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, assignedToUserId }),
    });
    if (response.ok) {
      return response.json();
    }
    const text = await response.text();
    throw new BadRequestException(`Core reassign failed: ${text}`);
  }
}
