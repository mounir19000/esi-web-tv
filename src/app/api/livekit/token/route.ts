import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { canViewScopedContent } from '@/lib/content-access';
import { randomUUID } from 'crypto';
import { getLiveKitCredentials, LiveKitConfigurationError } from '@/lib/livekit-config';
import { getCurrentAuth } from '@/lib/current-user';

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

  let credentials: ReturnType<typeof getLiveKitCredentials>;
  try {
    credentials = getLiveKitCredentials();
  } catch (error) {
    if (error instanceof LiveKitConfigurationError) {
      console.error(`LiveKit token configuration error: ${error.message}`);
      return NextResponse.json({ error: 'LiveKit is not configured' }, { status: 503 });
    }

    throw error;
  }

  const participantIdentity = user?.id || `guest-${randomUUID()}`;
  const participantName = user?.name || 'Guest';
  
  const at = new AccessToken(credentials.apiKey, credentials.apiSecret, {
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
