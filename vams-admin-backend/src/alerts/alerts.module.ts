import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { ReminderSchedulerService } from './reminder-scheduler.service';

@Module({
  controllers: [AlertsController],
  providers: [AlertsService, ReminderSchedulerService],
  exports: [AlertsService, ReminderSchedulerService],
})
export class AlertsModule {}
