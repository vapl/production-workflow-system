import Link from "next/link";

const benefits = [
  "Mazāk manuāla darba un mazāk kļūdu ražošanā",
  "Reāllaika pārskats par pasūtījumiem, rindām un bottleneck zonām",
  "Vienots process komandai, noliktavai un ārējiem partneriem",
];

const steps = [
  {
    title: "1. Ieplāno",
    description:
      "Savāc pasūtījuma datus un automātiski izveido darba plūsmu komandai.",
  },
  {
    title: "2. Izpildi",
    description:
      "Operatori seko statusiem, skenē QR un atzīmē progresu bez liekiem klikšķiem.",
  },
  {
    title: "3. Uzraugi",
    description:
      "Vadītāji redz KPI, aizkavēšanos riskus un var pieņemt lēmumus ātrāk.",
  },
];

const faqs = [
  {
    q: "Vai varam sākt bez pilnas ERP integrācijas?",
    a: "Jā. Platformu var ieviest pa soļiem un integrācijas pieslēgt vēlāk.",
  },
  {
    q: "Vai sistēma der vairākām ražotnēm?",
    a: "Jā, arhitektūra ir multi-tenant un piemērota vairāku komandu darbam.",
  },
  {
    q: "Cik ātri varam palaist pilotu?",
    a: "Tipiski 1–2 nedēļās, atkarībā no datu gatavības un procesa sarežģītības.",
  },
];

export function LandingPage() {
  return (
    <main>
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-10 md:px-10 md:pt-16">
        <nav className="mb-14 flex items-center justify-between">
          <p className="text-sm font-semibold tracking-[0.2em] text-sky-300">PWS</p>
          <div className="flex items-center gap-3">
            <Link
              href="/auth"
              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
            >
              Login
            </Link>
            <Link
              href="#cta"
              className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400"
            >
              Pieteikt demo
            </Link>
          </div>
        </nav>

        <div className="grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-end">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
              B2B SaaS ražošanas komandām
            </p>
            <h1 className="text-4xl font-semibold leading-tight md:text-6xl">
              Digitāla ražošanas vadība bez haosa tabulās.
            </h1>
            <p className="mt-6 max-w-2xl text-base text-slate-300 md:text-lg">
              Production Workflow System palīdz savienot pārdošanu, ražošanu un
              noliktavu vienā plūsmā, lai pasūtījumi kustētos ātrāk un paredzamāk.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/auth"
                className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-400"
              >
                Sākt darbu
              </Link>
              <Link
                href="#pricing"
                className="rounded-full border border-slate-700 px-5 py-3 text-sm text-slate-100 hover:border-slate-500"
              >
                Skatīt cenas
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-sky-900/20">
            <p className="text-sm text-slate-300">Kāpēc uzņēmumi izvēlas PWS</p>
            <ul className="mt-4 space-y-3 text-sm text-slate-200">
              {benefits.map((item) => (
                <li key={item} className="rounded-lg bg-slate-800/80 px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-800 bg-slate-900/40 px-6 py-16 md:px-10">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold md:text-3xl">Par mums</h2>
            <p className="mt-4 text-slate-300">
              Mēs veidojam sistēmu ražošanas uzņēmumiem, kuriem ir svarīga
              prognozējamība, izsekojamība un komandas efektivitāte ikdienas darbā.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["99.9%", "datu pieejamība"],
              ["24/7", "procesu redzamība"],
              ["-30%", "mazāk manuālu darbību"],
            ].map(([value, label]) => (
              <div key={value} className="rounded-xl border border-slate-800 p-4">
                <p className="text-2xl font-semibold text-sky-300">{value}</p>
                <p className="text-sm text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 md:px-10" id="how-it-works">
        <h2 className="text-2xl font-semibold md:text-3xl">Kā tas strādā</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <article key={step.title} className="rounded-xl border border-slate-800 p-5">
              <h3 className="font-medium">{step.title}</h3>
              <p className="mt-3 text-sm text-slate-300">{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 md:px-10" id="pricing">
        <h2 className="text-2xl font-semibold md:text-3xl">Cenas</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["Starter", "No €299 / mēn"],
            ["Growth", "No €799 / mēn"],
            ["Enterprise", "Individuāli"],
          ].map(([tier, price]) => (
            <div key={tier} className="rounded-xl border border-slate-800 p-6">
              <p className="text-lg font-semibold">{tier}</p>
              <p className="mt-2 text-slate-300">{price}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16 md:px-10">
        <h2 className="text-2xl font-semibold md:text-3xl">FAQ</h2>
        <div className="mt-8 space-y-4">
          {faqs.map((item) => (
            <article key={item.q} className="rounded-xl border border-slate-800 p-5">
              <h3 className="font-medium">{item.q}</h3>
              <p className="mt-2 text-sm text-slate-300">{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="cta" className="bg-sky-500/10 px-6 py-16 md:px-10">
        <div className="mx-auto max-w-5xl rounded-2xl border border-sky-400/30 bg-slate-900 p-8 text-center">
          <h2 className="text-2xl font-semibold md:text-3xl">
            Gatavi sakārtot ražošanas procesu?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-300">
            Piesakiet demo, sazinieties ar mums vai pieslēdzieties sistēmai,
            lai redzētu PWS darbībā.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/auth" className="rounded-full bg-sky-500 px-5 py-3 font-semibold text-slate-950">
              Login
            </Link>
            <Link href="mailto:hello@domain.eu" className="rounded-full border border-slate-700 px-5 py-3">
              Kontakti
            </Link>
            <Link href="#" className="rounded-full border border-slate-700 px-5 py-3">
              Pieprasīt demo
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 px-6 py-8 text-sm text-slate-400 md:px-10">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 sm:flex-row">
          <p>© {new Date().getFullYear()} Production Workflow System</p>
          <p>Built for modern manufacturing teams.</p>
        </div>
      </footer>
    </main>
  );
}
