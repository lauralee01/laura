import {
  LegalPageShell,
  LegalSection,
} from '@/components/LegalPageShell';

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      updated="Last updated: June 29, 2026"
    >
      <LegalSection title="Acceptance">
        <p>By using Laura, you agree to these Terms of Service.</p>
      </LegalSection>

      <LegalSection title="Description of Service">
        <p>
          Laura is an AI assistant that helps users manage conversations,
          calendars, email drafting, reminders, and productivity tasks using
          artificial intelligence.
        </p>
      </LegalSection>

      <LegalSection title="User Responsibilities">
        <ul>
          <li>Use Laura responsibly.</li>
          <li>Do not use Laura for illegal activities.</li>
          <li>
            Only connect Google accounts that belong to you or that you are
            authorized to use.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="AI Responses">
        <p>
          Laura generates responses using artificial intelligence. While we
          strive for accuracy, responses may occasionally be incomplete or
          incorrect. Users should verify important information before relying
          on it.
        </p>
      </LegalSection>

      <LegalSection title="Google Services">
        <p>
          Calendar and Gmail features are only available after explicit user
          authorization through Google OAuth.
        </p>
      </LegalSection>

      <LegalSection title="Availability">
        <p>
          Laura is provided on an &quot;as available&quot; basis. We may update,
          improve, or temporarily suspend features without prior notice.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>Questions regarding these Terms may be sent to:</p>
        <p className="font-medium text-ink">lauraoghwono@gmail.com</p>
      </LegalSection>
    </LegalPageShell>
  );
}
