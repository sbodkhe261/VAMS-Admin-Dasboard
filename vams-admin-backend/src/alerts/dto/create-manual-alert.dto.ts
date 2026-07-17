import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateManualAlertDto {
  @IsString()
  @IsOptional()
  vin?: string;

  @IsString()
  @IsNotEmpty()
  alertDefinitionId: string;

  @IsString()
  @IsOptional()
  defectName?: string;

  @IsString()
  @IsOptional()
  assignedToUserId?: string;

  @IsString()
  @IsOptional()
  assignedToRole?: string;

  @IsString()
  @IsOptional()
  severity?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
