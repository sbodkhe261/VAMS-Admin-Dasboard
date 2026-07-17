import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReminderSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private intervalId: NodeJS.Timeout | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('Repeating reminder scheduler service initialized.');
    // Check every 1 minute for rapid development testing and precise SLA execution
    const intervalMs = process.env.REMINDER_INTERVAL_MS 
      ? parseInt(process.env.REMINDER_INTERVAL_MS, 10) 
      : 1 * 60 * 1000;

    this.intervalId = setInterval(() => {
      this.checkEscalationsAndReminders().catch((err) => {
        this.logger.error('Error in background reminders loop:', err.stack);
      });
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async checkEscalationsAndReminders() {
    this.logger.log('SLA Checker: Polling active alert assignments...');
    const now = new Date();

    // 1. Fetch all active open assignments
    const activeAssignments = await this.prisma.alertAssignment.findMany({
      where: { status: 'OPEN' },
    });

    for (const assignment of activeAssignments) {
      try {
        // Fetch full alert and definition context
        const alert = await this.prisma.alert.findUnique({
          where: { id: assignment.alertId },
          include: { company: true },
        });
        if (!alert || alert.status === 'RESOLVED') {
          // If alert is already resolved, deactivate this assignment
          await this.prisma.alertAssignment.update({
            where: { id: assignment.id },
            data: { status: 'RESOLVED' },
          });
          continue;
        }

        // Resolve Alert Definition details if present
        let escalationTimeoutMin = 30; // default fallback 30m
        let escalationChain: string[] = [];
        let primaryAssigneeId = alert.assignedToUserId;
        let criticalOverride = false;

        if (alert.alertDefinitionId) {
          const alertDef = await this.prisma.alertDefinition.findUnique({
            where: { id: alert.alertDefinitionId },
          });
          if (alertDef) {
            escalationTimeoutMin = alertDef.escalationTimeout;
            escalationChain = alertDef.escalationChain || [];
            primaryAssigneeId = alertDef.primaryAssigneeId;
            criticalOverride = alertDef.criticalOverride;
          }
        }

        // Calculate time elapsed since assignment and notification
        const elapsedSinceAssignedMs = now.getTime() - new Date(assignment.assignedAt).getTime();
        const elapsedSinceNotifiedMs = now.getTime() - new Date(assignment.notifiedAt).getTime();

        const elapsedAssignedMin = elapsedSinceAssignedMs / (60 * 1000);
        const elapsedNotifiedMin = elapsedSinceNotifiedMs / (60 * 1000);

        // --- CHECK ESCALATION ---
        if (alert.alertDefinitionId && escalationChain.length > 0 && elapsedAssignedMin >= escalationTimeoutMin) {
          this.logger.warn(`Alert ${alert.id} SLA exceeded timeout of ${escalationTimeoutMin}m. Escalate!`);

          let nextUserId: string | null = null;
          let nextEscalationLevel = assignment.escalationLevel + 1;
          let loopCompleted = false;

          if (escalationChain.length > 0 && nextEscalationLevel <= escalationChain.length) {
            // Pick next user in the escalation list
            nextUserId = escalationChain[nextEscalationLevel - 1];
          } else {
            // Loop back around to the first user
            nextUserId = escalationChain[0] || primaryAssigneeId;
            nextEscalationLevel = 1;
            loopCompleted = true;
          }

          if (nextUserId) {
            this.logger.log(`Escalating alert ${alert.id} to user ${nextUserId} (Level: ${nextEscalationLevel})`);

            // Perform transaction to execute transition
            await this.prisma.$transaction(async (tx) => {
              // Deactivate current active assignment
              await tx.alertAssignment.update({
                where: { id: assignment.id },
                data: { status: 'ESCALATED' },
              });

              // Create new assignment
              const newAssignment = await tx.alertAssignment.create({
                data: {
                  alertId: alert.id,
                  severity: alert.severity,
                  assignedToId: nextUserId!,
                  assignedAt: now,
                  notifiedAt: now,
                  seenAt: null,
                  reminderCount: 0,
                  escalationLevel: nextEscalationLevel,
                  status: 'OPEN',
                },
              });

              // Update Alert assignee details
              const nextUser = await tx.user.findUnique({ where: { id: nextUserId! } });
              await tx.alert.update({
                where: { id: alert.id },
                data: {
                  assignedToUserId: nextUserId,
                  assignedToRole: nextUser ? nextUser.role : 'WORKER',
                },
              });

              // Write Audit Log
              const crypto = require('crypto');
              await tx.alertNotificationLog.create({
                data: {
                  id: crypto.randomUUID(),
                  alertId: alert.id,
                  userId: nextUserId!,
                  type: 'ESCALATION',
                  message: `Alert SLA exceeded. Auto-escalated to level ${nextEscalationLevel}.`,
                },
              });

              await tx.defectResolutionTimeline.create({
                data: {
                  alertId: alert.id,
                  actionType: 'ASSIGNED',
                  details: `Alert auto-escalated to ${nextUser ? nextUser.name : 'Operator'} (Level ${nextEscalationLevel}) due to SLA timeout.`,
                },
              });

              // If loop completed, notify the Admin/Owner directly as a fallback
              if (loopCompleted) {
                const admins = await tx.user.findMany({
                  where: {
                    companyId: alert.companyId,
                    role: { in: ['COMPANY_ADMIN', 'FACTORY_MANAGER'] },
                    isActive: true,
                  },
                });

                for (const adminUser of admins) {
                  await tx.alertNotificationLog.create({
                    data: {
                      id: crypto.randomUUID(),
                      alertId: alert.id,
                      userId: adminUser.id,
                      type: 'ESCALATION',
                      message: `ALERT SLA ALERT LOOP COMPLETE: Alert has looped through entire escalation chain and remains unresolved.`,
                    },
                  });
                }
              }
            });

            // Trigger core notification webhook
            const coreUrl = process.env.CORE_BACKEND_URL || 'http://127.0.0.1:3000/api/v1';
            try {
              const msg = `SLA Exceeded. Escalated to you: defect '${alert.defectName}' (VIN: ${alert.vin || 'N/A'}).`;
              
              const payload: any = {
                source: 'scheduler',
                event_type: 'ESCALATION',
                companyId: alert.companyId,
                alertId: alert.id,
                assignedToUserId: nextUserId,
                message: msg,
              };

              if (loopCompleted) {
                payload.loopCompleted = true;
              }

              await (global as any).fetch(`${coreUrl}/alerts/event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
            } catch (err: any) {
              this.logger.warn(`Failed to trigger escalation webhook: ${err.message}`);
            }

            continue; // Skip reminder check for this loop since we transitioned
          }
        }

        // --- CHECK REMINDERS (If unseen) ---
        if (assignment.seenAt === null) {
          let intervalMin = 120; // Default Medium/High: 2 hours
          if (alert.severity === 'CRITICAL' || alert.severity === 'EMERGENCY') {
            intervalMin = 30; // 30 minutes
          } else if (alert.severity === 'LOW' || alert.severity === 'INFO') {
            intervalMin = 24 * 60; // 1 day (24 hours)
          }

          if (elapsedNotifiedMin >= intervalMin) {
            this.logger.warn(`Reminder SLA matched for active assignment ${assignment.id} (Interval: ${intervalMin}m)`);

            // Update notifiedAt timestamp and increment reminder count
            await this.prisma.alertAssignment.update({
              where: { id: assignment.id },
              data: {
                notifiedAt: now,
                reminderCount: assignment.reminderCount + 1,
              },
            });

            const crypto = require('crypto');
            await this.prisma.alertNotificationLog.create({
              data: {
                id: crypto.randomUUID(),
                alertId: alert.id,
                userId: assignment.assignedToId,
                type: 'REMINDER',
                message: `Unseen Alert Reminder: Defect '${alert.defectName}' is still awaiting response.`,
              },
            });

            // Trigger core notification webhook
            const coreUrl = process.env.CORE_BACKEND_URL || 'http://127.0.0.1:3000/api/v1';
            try {
              const msg = `Reminder! Your assigned alert '${alert.defectName}' (VIN: ${alert.vin || 'N/A'}) is unresolved and unseen.`;
              await (global as any).fetch(`${coreUrl}/alerts/event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  source: 'scheduler',
                  event_type: 'REMINDER',
                  companyId: alert.companyId,
                  alertId: alert.id,
                  assignedToUserId: assignment.assignedToId,
                  message: msg,
                }),
              });
            } catch (err: any) {
              this.logger.warn(`Failed to trigger reminder webhook: ${err.message}`);
            }
          }
        }
      } catch (err: any) {
        this.logger.error(`Error processing SLA check for assignment ${assignment.id}: ${err.message}`);
      }
    }
  }
}
