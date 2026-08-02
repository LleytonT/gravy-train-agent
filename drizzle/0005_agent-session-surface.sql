CREATE UNIQUE INDEX "uq_agent_sessions_conversation_surface" ON "agent_sessions" USING btree ("conversation_id","surface");
