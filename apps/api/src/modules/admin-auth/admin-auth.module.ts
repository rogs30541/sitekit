import { Global, Module } from '@nestjs/common';
import { AdminAuthController, AdminUsersController } from './admin-auth.controller';
import { AdminAuthService } from '@sitekit/core';

/** Global：AdminSessionGuard 在各模組都要注入 AdminAuthService。 */
@Global()
@Module({ controllers: [AdminAuthController, AdminUsersController], providers: [AdminAuthService], exports: [AdminAuthService] })
export class AdminAuthModule {}
