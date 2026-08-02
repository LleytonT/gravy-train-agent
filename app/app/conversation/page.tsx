import { ChatShell } from "@/components/chat/chat-shell";

export const dynamic = "force-dynamic";

export default function ConversationPage() {
  return (
    <div className="-mx-4 flex min-h-[70dvh] flex-1 flex-col md:-mx-6 md:-mb-8">
      <ChatShell embedded />
    </div>
  );
}
