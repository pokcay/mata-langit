import { Link, Head } from "@inertiajs/react"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <>
      <Head title="Hello world">
        <meta
          name="description"
          content="Landing page for Mata Langit — a Rails 8 + Inertia.js + React app."
        />
        <meta property="og:title" content="Hello world" />
        <meta
          property="og:description"
          content="Landing page for Mata Langit — a Rails 8 + Inertia.js + React app."
        />
      </Head>
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
        <h1>Hello world.</h1>
        <p className="mt-2 max-w-md text-ink-muted">
          Landing page for Mata Langit.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Button asChild>
            <Link href="/signup">Sign up</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </main>
    </>
  )
}
