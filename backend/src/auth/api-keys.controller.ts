import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-auth.decorator';
import type { AuthContext } from '../common/auth.types';
import { AuthGuard } from './auth.guard';
import { CsrfGuard } from './csrf.guard';
import { AuthService } from './auth.service';
import { CreateApiKeyDto } from './dto';

@Controller('api-keys')
@UseGuards(AuthGuard, CsrfGuard)
export class ApiKeysController {
  constructor(private readonly auth: AuthService) {}

  @Post()
  create(@CurrentUser() user: AuthContext['user'], @Body() dto: CreateApiKeyDto) {
    return this.auth.createApiKey(user.id, dto.name, dto.expiresAt);
  }

  @Get()
  list(@CurrentUser() user: AuthContext['user']) {
    return this.auth.listApiKeys(user.id);
  }

  @Delete(':id')
  async revoke(@CurrentUser() user: AuthContext['user'], @Param('id') id: string) {
    await this.auth.revokeApiKey(user.id, id);
    return { ok: true };
  }
}
