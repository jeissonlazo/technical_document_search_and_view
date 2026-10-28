import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateDocumentDto {
  @IsString({ message: 'El título es obligatorio.' })
  @MinLength(1, { message: 'El título es obligatorio.' })
  @MaxLength(300, { message: 'El título no puede superar 300 caracteres.' })
  @Matches(/\S/, { message: 'El título no puede estar vacío.' })
  title!: string;

  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto.' })
  @MaxLength(2000, { message: 'La descripción no puede superar 2000 caracteres.' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'El autor debe ser texto.' })
  @MaxLength(200, { message: 'El autor no puede superar 200 caracteres.' })
  author?: string;

  @IsOptional()
  @IsString({ message: 'La categoría debe ser texto.' })
  @MaxLength(120, { message: 'La categoría no puede superar 120 caracteres.' })
  category?: string;

  @IsOptional()
  @IsString({ message: 'La versión debe ser texto.' })
  @MaxLength(80, { message: 'La versión no puede superar 80 caracteres.' })
  version?: string;

  @IsOptional()
  @IsString({ message: 'Las etiquetas deben ser texto separado por comas.' })
  @MaxLength(500, { message: 'Las etiquetas no pueden superar 500 caracteres.' })
  tags?: string;
}
