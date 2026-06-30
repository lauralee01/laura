import Link from 'next/link';

export default function PrivacyPage() {
    return (
        <main className="mx-auto max-w-4xl px-6 py-16">
            <div className="mb-12 flex items-center justify-between border-b border-zinc-800 pb-5">
                <Link
                    href="/"
                    className="flex items-center gap-2 text-lg font-semibold text-white transition hover:text-zinc-300"
                >
                    <span>←</span>
                    <span>Laura</span>
                </Link>
            </div>
            <h1 className="mb-8 text-4xl font-bold">Privacy Policy</h1>

            <p className="mb-8 text-zinc-600 dark:text-zinc-400">
                Last updated: June 29, 2026
            </p>

            <section className="space-y-8">
                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        Introduction
                    </h2>

                    <p>
                        Laura is an AI-powered personal assistant designed to help users
                        manage tasks, calendars, emails, conversations, and productivity
                        workflows. This Privacy Policy explains what information Laura
                        collects, how it is used, and how it is protected.
                    </p>
                </div>

                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        Information We Collect
                    </h2>

                    <ul className="list-disc space-y-2 pl-6">
                        <li>Conversation history used to provide contextual responses.</li>
                        <li>Calendar information only when you explicitly connect Google Calendar.</li>
                        <li>Email draft information only when you request Laura to compose or send emails.</li>
                        <li>Optional long-term memories that Laura stores to personalize future conversations.</li>
                    </ul>
                </div>

                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        How We Use Your Information
                    </h2>

                    <ul className="list-disc space-y-2 pl-6">
                        <li>Generate AI responses.</li>
                        <li>Create, edit, or list calendar events.</li>
                        <li>Create and send Gmail drafts upon your request.</li>
                        <li>Improve conversation continuity using stored memories.</li>
                    </ul>
                </div>

                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        Google Account Access
                    </h2>

                    <p>
                        Laura only accesses Google services after you explicitly authorize
                        access using Google OAuth.
                    </p>

                    <p className="mt-3">
                        Laura currently requests permission to:
                    </p>

                    <ul className="list-disc space-y-2 pl-6">
                        <li>Create, update, delete, and list calendar events.</li>
                        <li>Access your calendar list.</li>
                        <li>Create Gmail drafts and send emails that you request.</li>
                    </ul>

                    <p className="mt-3">
                        Laura does <strong>not</strong> read your inbox or access unrelated
                        Google services.
                    </p>
                </div>

                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        AI Processing
                    </h2>

                    <p>
                        Laura uses Google's Gemini AI models to generate responses and
                        embeddings for optional memory retrieval. Conversation content may
                        be processed by Google AI services in accordance with Google's
                        applicable privacy policies.
                    </p>
                </div>

                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        Data Security
                    </h2>

                    <p>
                        We use industry-standard security practices to protect stored
                        conversation history, authentication tokens, and user data.
                    </p>
                </div>

                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        Your Choices
                    </h2>

                    <ul className="list-disc space-y-2 pl-6">
                        <li>You may disconnect your Google account at any time.</li>
                        <li>You may delete conversations from within Laura.</li>
                        <li>You may stop using Laura whenever you choose.</li>
                    </ul>
                </div>

                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        Contact
                    </h2>

                    <p>
                        If you have any questions regarding this Privacy Policy, please
                        contact:
                    </p>

                    <p className="mt-2 font-medium">
                        lauraoghwono@gmail.com
                    </p>
                </div>
            </section>
        </main>
    );
}