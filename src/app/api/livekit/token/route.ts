import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { canViewScopedContent } from '@/lib/content-access';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
  const session = await auth();

  const room = req.nextUrl.searchParams.get('room');
  if (!room) {
    return NextResponse.json({ error: 'Missing "room" query parameter' }, { status: 400 });
  }

  const stream = await prisma.liveStream.findUnique({
    where: { streamKey: room },
    include: { module: true },
  });

  if (!stream || !stream.isLive) {
    return NextResponse.json({ error: 'Live stream not found' }, { status: 404 });
  }

  if (!canViewScopedContent(stream, session?.user)) {
    return NextResponse.json(
      { error: session?.user ? 'Forbidden' : 'Sign in required' },
      { status: session?.user ? 403 : 401 },
    );
  }

  const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
  const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';

  const participantIdentity = session?.user?.id || `guest-${randomUUID()}`;
  const participantName = session?.user?.name || 'Guest';
  
  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: participantName,
  });

  const canPublish =
    session?.user?.role === 'ADMIN' ||
    Boolean(session?.user?.id && session.user.id === stream.hostId);

  at.addGrant({ 
    room, 
    roomJoin: true, 
    canPublish, 
    canSubscribe: true 
  });

  const token = await at.toJwt();
  return NextResponse.json({ token });
}
