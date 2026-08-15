import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { canViewScopedContent } from '@/lib/content-access';
import { randomUUID } from 'crypto';
import { getCurrentAuth } from '@/lib/current-user';
import { appConfig } from '@/lib/env';

export async function GET(req: NextRequest) {
  const { session, user } = await getCurrentAuth();

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

  if (session?.user && !user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  if (!canViewScopedContent(stream, user)) {
    return NextResponse.json(
      { error: user ? 'Forbidden' : 'Sign in required' },
      { status: user ? 403 : 401 },
    );
  }

  const participantIdentity = user?.id || `guest-${randomUUID()}`;
  const participantName = user?.name || 'Guest';
  
  const at = new AccessToken(appConfig.livekit.apiKey, appConfig.livekit.apiSecret, {
    identity: participantIdentity,
    name: participantName,
  });

  const canPublish =
    user?.role === 'ADMIN' ||
    Boolean(user?.id && user.id === stream.hostId);

  at.addGrant({ 
    room, 
    roomJoin: true, 
    canPublish, 
    canSubscribe: true 
  });

  const token = await at.toJwt();
  return NextResponse.json({ token });
}
