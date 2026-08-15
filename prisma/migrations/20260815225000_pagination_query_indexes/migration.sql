CREATE INDEX "User_createdAt_id_idx" ON "User"("createdAt", "id");
CREATE INDEX "User_role_email_id_idx" ON "User"("role", "email", "id");
CREATE INDEX "User_role_createdAt_id_idx" ON "User"("role", "createdAt", "id");
CREATE INDEX "User_provisioningStatus_createdAt_id_idx" ON "User"("provisioningStatus", "createdAt", "id");
CREATE INDEX "User_provisioningStatus_role_createdAt_id_idx" ON "User"("provisioningStatus", "role", "createdAt", "id");
CREATE INDEX "User_yearGroup_createdAt_id_idx" ON "User"("yearGroup", "createdAt", "id");
CREATE INDEX "User_yearGroup_role_email_id_idx" ON "User"("yearGroup", "role", "email", "id");

CREATE INDEX "Module_yearGroup_name_id_idx" ON "Module"("yearGroup", "name", "id");
CREATE INDEX "Module_createdAt_id_idx" ON "Module"("createdAt", "id");

CREATE INDEX "Video_status_createdAt_id_idx" ON "Video"("status", "createdAt", "id");
CREATE INDEX "Video_status_sourceKey_idx" ON "Video"("status", "sourceKey");
CREATE INDEX "Video_isPublic_status_createdAt_id_idx" ON "Video"("isPublic", "status", "createdAt", "id");
CREATE INDEX "Video_audience_status_createdAt_id_idx" ON "Video"("audience", "status", "createdAt", "id");
CREATE INDEX "Video_type_status_createdAt_id_idx" ON "Video"("type", "status", "createdAt", "id");
CREATE INDEX "Video_moduleId_status_createdAt_id_idx" ON "Video"("moduleId", "status", "createdAt", "id");
CREATE INDEX "Video_cohortId_status_createdAt_id_idx" ON "Video"("cohortId", "status", "createdAt", "id");
CREATE INDEX "Video_uploaderId_status_createdAt_id_idx" ON "Video"("uploaderId", "status", "createdAt", "id");

CREATE INDEX "UploadSession_ownerId_state_expiresAt_id_idx" ON "UploadSession"("ownerId", "state", "expiresAt", "id");
CREATE INDEX "UploadSession_state_createdAt_id_idx" ON "UploadSession"("state", "createdAt", "id");

CREATE INDEX "LiveStream_isLive_createdAt_id_idx" ON "LiveStream"("isLive", "createdAt", "id");
CREATE INDEX "LiveStream_isLive_isPublic_createdAt_id_idx" ON "LiveStream"("isLive", "isPublic", "createdAt", "id");
CREATE INDEX "LiveStream_audience_isLive_createdAt_id_idx" ON "LiveStream"("audience", "isLive", "createdAt", "id");
CREATE INDEX "LiveStream_status_createdAt_id_idx" ON "LiveStream"("status", "createdAt", "id");
CREATE INDEX "LiveStream_moduleId_isLive_createdAt_id_idx" ON "LiveStream"("moduleId", "isLive", "createdAt", "id");
CREATE INDEX "LiveStream_cohortId_isLive_createdAt_id_idx" ON "LiveStream"("cohortId", "isLive", "createdAt", "id");
CREATE INDEX "LiveStream_hostId_status_createdAt_id_idx" ON "LiveStream"("hostId", "status", "createdAt", "id");

CREATE INDEX "Recording_status_createdAt_id_idx" ON "Recording"("status", "createdAt", "id");

CREATE INDEX "RecordingJob_streamId_status_createdAt_id_idx" ON "RecordingJob"("streamId", "status", "createdAt", "id");
CREATE INDEX "RecordingJob_status_createdAt_id_idx" ON "RecordingJob"("status", "createdAt", "id");

CREATE INDEX "AuditEvent_type_createdAt_id_idx" ON "AuditEvent"("type", "createdAt", "id");
CREATE INDEX "AuditEvent_createdAt_id_idx" ON "AuditEvent"("createdAt", "id");
