# ESI Web TV - Final Implementation Plan

This updated plan incorporates all your feedback. We are utilizing the school's VM to create a fully self-hosted, scalable, and highly interactive Web TV platform.

## Proposed Changes

We will build the platform as a **Next.js** application, focusing heavily on a responsive (mobile-first), premium UI.

### 1. Database & Authentication
- **PostgreSQL**: To store users, roles, modules, and video metadata.
- **NextAuth.js**: Configured with Google Provider to restrict sign-ins exclusively to `@esi.dz` emails.
- **Role System**:
  - `Guest/Public`: Views public club/explanation videos.
  - `Student`: Automatically mapped to their year via mailing lists. Views their specific modules.
  - `Teacher`: Can upload VODs and start live streams from the browser.
  - `Admin`: Full control over the platform and user roles.

### 2. Video Infrastructure (Self-Hosted on VM)
- **Live Streaming (LiveKit)**: We will run **LiveKit** on the VM. This is a WebRTC server that allows teachers to go live *directly from their browser* (using their webcam and screen share) without needing external software like OBS. 
  - *Recording*: LiveKit's Egress module will automatically record the live stream. Once finished, teachers can download, share, or discard the recording.
- **VOD Storage (MinIO)**: We will install **MinIO**, an S3-compatible object storage server, on the VM. This is the absolute best option for scaling, as it allows you to easily add more storage nodes in the future.
- **Video Transcoding (FFmpeg)**: When a teacher uploads an `.mp4` file, our Next.js backend will use **FFmpeg** on the VM to transcode the video into different resolutions (e.g., 1080p, 720p, 480p) before saving it to MinIO, ensuring smooth playback for users with varying internet speeds.

### 3. Frontend Application & Design
- **Mobile-First & Responsive**: The entire platform will be built with mobile users in mind.
- **Premium Design System**: We will implement a high-end, cohesive design system (avoiding the "vibe coded" look). It will feature a polished layout, consistent typography, and a modern color palette, adapting to the school's logo that you will provide.
- **Pages**:
  - `Home`: Premium landing page showcasing active live streams and featured videos.
  - `Explore`: Browse videos by category (Clubs, Explanations, Teaching).
  - `Live Room`: The interactive web interface where teachers broadcast and students watch/chat.
  - `Dashboard`: Where teachers manage their uploaded videos and live stream recordings.

### 4. Development Workflow
- We will initialize a **Git repository** at the start.
- After every logical step (e.g., Auth setup, MinIO integration, LiveKit integration), we will make clean, well-documented commits.

## Verification Plan

### Automated Tests
- Type checking and Next.js build validation.

### Manual Verification
- Log in with `@esi.dz`.
- Start a browser-based live stream and verify it records to MinIO.
- Upload a standard `.mp4` and verify that FFmpeg transcodes it into multiple resolutions.
- Check responsive layouts on simulated mobile devices.
