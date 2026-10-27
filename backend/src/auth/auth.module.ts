import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ApiKeysController } from './api-keys.controller';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CsrfGuard } from './csrf.guard';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [AuthController, ApiKeysController],
  providers: [AuthService, AuthGuard, CsrfGuard],
  exports: [AuthService, AuthGuard, CsrfGuard],
})
export class AuthModule {}
