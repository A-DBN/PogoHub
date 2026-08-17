/**
 * Utilitaire de développement : crée (ou réutilise) un compte de test et
 * imprime un cookie de session valide, pratique pour vérifier une page
 * connectée sans passer par le formulaire.
 *   npm run dev:session -- test@example.com
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { prisma } from '../src/server/db';

async function main() {
  const email = (process.argv[2] ?? 'dev@pogohub.local').toLowerCase();
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash: await bcrypt.hash('devpassword', 10),
      username: email.split('@')[0].slice(0, 20),
      role: 'ADMIN',
    },
    update: {},
    select: { id: true, email: true, username: true, role: true },
  });

  const token = await new SignJWT({ sub: user.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

  console.log(JSON.stringify({ ...user, cookie: `pogohub-session=${token}` }));
}

main().finally(() => prisma.$disconnect());
