import {
  LegalPageShell,
  LegalSection,
} from '@/components/LegalPageShell';

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      updated="Last updated: June 29, 2026"
    >
      <LegalSection title="Introduction">
        <p>
          Laura is an AI-powered personal assistant designed to help users
          manage tasks, calendars, emails, conversations, and productivity
          workflows. This Privacy Policy explains what information Laura
          collects, how it is used, and how it is protected.
        </p>
      </LegalSection>

      <LegalSection title="Information We Collect">
        <ul>
          <li>Conversation history used to provide contextual responses.</li>
          <li>
            Calendar information only when you explicitly connect Google
            Calendar.
          </li>
          <li>
            Email draft information only when you request Laura to compose or
            send emails.
          </li>
          <li>
            Optional long-term memories that Laura stores to personalize future
            conversations.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How We Use Your Information">
        <ul>
          <li>Generate AI responses.</li>
          <li>Create, edit, or list calendar events.</li>
          <li>Create and send Gmail drafts upon your request.</li>
          <li>Improve conversation continuity using stored memories.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Google Account Access">
        <p>
          Laura only accesses Google services after you explicitly authorize
          access using Google OAuth.
        </p>
        <p>Laura currently requests permission to:</p>
        <ul>
          <li>Create, update, delete, and list calendar events.</li>
          <li>Access your calendar list.</li>
          <li>Create Gmail drafts and send emails that you request.</li>
        </ul>
        <p>
          Laura does <strong>not</strong> read your inbox or access unrelated
          Google services.
        </p>
      </LegalSection>

      <LegalSection title="AI Processing">
        <p>
          Laura uses Google&apos;s Gemini AI models to generate responses and
          embeddings for optional memory retrieval. Conversation content may be
          processed by Google AI services in accordance with Google&apos;s
          applicable privacy policies.
        </p>
      </LegalSection>

      <LegalSection title="Data Security">
        <p>
          We use industry-standard security practices to protect stored
          conversation history, authentication tokens, and user data.
        </p>
      </LegalSection>

      <LegalSection title="Your Choices">
        <ul>
          <li>You may disconnect your Google account at any time.</li>
          <li>You may delete conversations from within Laura.</li>
          <li>You may stop using Laura whenever you choose.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          If you have any questions regarding this Privacy Policy, please
          contact:
        </p>
        <p className="font-medium text-ink">lauraoghwono@gmail.com</p>
      </LegalSection>
    </LegalPageShell>
  );
}
