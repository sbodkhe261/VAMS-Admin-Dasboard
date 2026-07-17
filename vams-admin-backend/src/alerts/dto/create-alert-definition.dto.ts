import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray, IsInt, IsBoolean } from 'class-validator';
import { Severity } from '@prisma/client';

export class CreateAlertDefinitionDto {
  @IsString()
  @IsNotEmpty()
  alertId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  definition?: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsEnum(Severity)
  severity: Severity;

  @IsString()
  @IsNotEmpty()
  primaryAssigneeId: string;

  @IsArray()
  @IsString({ each: true })
  escalationChain: string[];

  @IsInt()
  escalationTimeout: number;

  @IsBoolean()
  @IsOptional()
  criticalOverride?: boolean;
}
