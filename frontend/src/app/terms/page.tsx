import Link from 'next/link';


export default function TermsPage() {
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
            <h1 className="mb-8 text-4xl font-bold">
                Terms of Service
            </h1>

            <p className="mb-8 text-zinc-600 dark:text-zinc-400">
                Last updated: June 29, 2026
            </p>

            <section className="space-y-8">

                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        Acceptance
                    </h2>

                    <p>
                        By using Laura, you agree to these Terms of Service.
                    </p>
                </div>

                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        Description of Service
                    </h2>

                    <p>
                        Laura is an AI assistant that helps users manage conversations,
                        calendars, email drafting, reminders, and productivity tasks using
                        artificial intelligence.
                    </p>
                </div>

                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        User Responsibilities
                    </h2>

                    <ul className="list-disc space-y-2 pl-6">
                        <li>Use Laura responsibly.</li>
                        <li>Do not use Laura for illegal activities.</li>
                        <li>Only connect Google accounts that belong to you or that you are authorized to use.</li>
                    </ul>
                </div>

                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        AI Responses
                    </h2>

                    <p>
                        Laura generates responses using artificial intelligence. While we
                        strive for accuracy, responses may occasionally be incomplete or
                        incorrect. Users should verify important information before relying
                        on it.
                    </p>
                </div>

                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        Google Services
                    </h2>

                    <p>
                        Calendar and Gmail features are only available after explicit user
                        authorization through Google OAuth.
                    </p>
                </div>

                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        Availability
                    </h2>

                    <p>
                        Laura is provided on an "as available" basis. We may update,
                        improve, or temporarily suspend features without prior notice.
                    </p>
                </div>

                <div>
                    <h2 className="mb-2 text-2xl font-semibold">
                        Contact
                    </h2>

                    <p>
                        Questions regarding these Terms may be sent to:
                    </p>

                    <p className="mt-2 font-medium">
                        lauraoghwono@gmail.com
                    </p>
                </div>

            </section>
        </main>
    );
}