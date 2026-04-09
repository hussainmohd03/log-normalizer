import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User, UserRole } from 'generated/prisma/client';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
} as const;

type SafeUser = Pick<User, keyof typeof SAFE_USER_SELECT>;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async list(): Promise<SafeUser[]> {
    return this.prisma.user.findMany({
      select: { ...SAFE_USER_SELECT, passwordHash: false },
      orderBy: { createdAt: 'asc' },
    }) as Promise<SafeUser[]>;
  }

  async create(dto: CreateUserDto): Promise<User> {
    try {
      return await this.authService.createUser(dto);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('A user with that email already exists');
      }
      throw err;
    }
  }

  async delete(actorId: string, targetId: string): Promise<void> {
    if (actorId === targetId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException(`User ${targetId} not found`);
    }

    if (target.role === UserRole.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: { role: UserRole.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException(
          'Cannot delete the last admin account',
        );
      }
    }

    await this.prisma.user.delete({ where: { id: targetId } });
    this.logger.log(
      { actorId, targetId, targetEmail: target.email },
      'users.deleted',
    );
  }
}
