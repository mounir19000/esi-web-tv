import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const room = req.nextUrl.searchParams.get('room');
  if (!room) {
    return NextResponse.json({ error: 'Missing "room" query parameter' }, { status: 400 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
  const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';

  const participantName = session.user.name || 'Anonymous';
  
  const at = new AccessToken(apiKey, apiSecret, {
    identity: session.user.id,
    name: participantName,
  });

  // Decide permissions based on role
  // Teachers can publish, Students can only subscribe/chat
  const canPublish = session.user.role === 'TEACHER' || session.user.role === 'ADMIN';

  at.addGrant({ 
    room, 
    roomJoin: true, 
    canPublish, 
    canSubscribe: true 
  });

  const token = await at.toJwt();
  return NextResponse.json({ token });
}
