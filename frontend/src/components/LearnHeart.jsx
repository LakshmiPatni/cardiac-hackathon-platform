import React, { useCallback, useEffect, useRef, useState } from 'react';
import HeartViewer from './HeartViewer';
import { PART_INFO, CHECKED_ARTERIES, OTHER_PARTS } from './HeartInfo';

/** True while the element is on (or near) the screen. Used to stop drawing 3D hearts nobody can see. */
export function useInView(rootMargin = '250px') {
  const ref = useRef(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return [ref, inView];
}

const STEPS = [
  { n: '1', title: 'Learn the basics', text: 'What the heart\'s own arteries do and why they matter.' },
  { n: '2', title: 'Meet a healthy heart', text: 'Turn a 3D heart and tap each part to see its name.' },
  { n: '3', title: 'Add patient details', text: 'Pick a sample, type values in, or upload a report.' },
  { n: '4', title: 'Compare and read', text: 'See a healthy heart next to the patient\'s, with the risk in plain numbers.' },
];

const GLOSSARY = [
  ['Coronary arteries', 'The three main arteries that run over the surface of the heart and feed the heart muscle with blood.'],
  ['Stenosis', 'A narrowing inside an artery, usually from a build-up of fatty deposits called plaque.'],
  ['Coronary artery disease (CAD)', 'When one or more of the heart\'s arteries is narrowed by about half or more.'],
  ['Probability', 'How likely the model thinks something is. 80% means "very likely", not "certain". It is an estimate.'],
];

export function Intro({ onExplore, onCheck }) {
  return (
    <section id="learn" className="mx-auto max-w-5xl scroll-mt-24 pb-20 pt-10">
      <p className="text-sm text-[#9aa6ab]">A plain-language guide to the arteries of the heart</p>
      <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-[1.1] text-white md:text-6xl">
        How well is blood reaching the heart itself?
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#c9c2b8]">
        The heart pumps blood to the whole body, but the heart is also a muscle that needs a steady supply of its own.
        This page explains how that supply works, lets you explore a healthy heart in 3D, and then shows how a
        patient's results compare.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onExplore}
          className="rounded-xl bg-[#ece5da] px-5 py-3 text-sm font-semibold text-[#0f1417] transition hover:bg-white"
        >
          Explore a healthy heart
        </button>
        <button
          type="button"
          onClick={onCheck}
          className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Skip to the patient check
        </button>
      </div>

      {/* What is going on */}
      <div className="mt-16 grid gap-5 md:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-[#0f1417] p-6">
          <h2 className="font-serif text-xl text-white">The heart has its own pipes</h2>
          <p className="mt-3 text-sm leading-relaxed text-[#9aa6ab]">
            Blood flowing through the heart's chambers does not feed the heart wall. Instead, three main arteries run
            over the surface of the heart and soak the muscle with oxygen. They are called the coronary arteries.
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-[#0f1417] p-6">
          <h2 className="font-serif text-xl text-white">Pipes can narrow over time</h2>
          <p className="mt-3 text-sm leading-relaxed text-[#9aa6ab]">
            Fatty deposits can slowly build up inside an artery and make it narrower, like limescale in a water pipe.
            Doctors call this narrowing stenosis. When it reaches about half the width of the artery, it counts as
            coronary artery disease.
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-[#0f1417] p-6">
          <h2 className="font-serif text-xl text-white">What this tool does</h2>
          <p className="mt-3 text-sm leading-relaxed text-[#9aa6ab]">
            You give it a few health details, such as age, blood pressure, cholesterol and heart test results. A
            computer model, trained on a public set of 303 patients, estimates how likely each of the three arteries is
            to be narrowed, and shows it on a 3D heart.
          </p>
        </article>
      </div>

      <p className="mt-6 max-w-3xl rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100">
        This is a learning and decision-support tool. It is not a diagnosis and does not replace a doctor or heart
        scans. If you or someone near you has chest pain, trouble breathing or fainting right now, call your local
        emergency number.
      </p>

      {/* How the page works */}
      <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <li key={s.n} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">{s.n}</span>
            <h3 className="mt-3 text-sm font-semibold text-white">{s.title}</h3>
            <p className="mt-1 text-sm text-[#9aa6ab]">{s.text}</p>
          </li>
        ))}
      </ol>

      {/* Words used on this page */}
      <dl className="mt-14 grid gap-x-10 gap-y-5 md:grid-cols-2">
        {GLOSSARY.map(([term, text]) => (
          <div key={term}>
            <dt className="text-sm font-semibold text-white">{term}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-[#9aa6ab]">{text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The healthy heart, with a list of parts that stays in sync with the 3D view. */
export function HealthyHeartLesson({ paused = false }) {
  const [sectionRef, inView] = useInView();
  const [selected, setSelected] = useState(null);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [available, setAvailable] = useState(null); // ids the 3D model really contains

  const onPartsLoaded = useCallback((parts) => setAvailable(new Set(parts.map((p) => p.id))), []);
  const onPartSelect = useCallback((part) => {
    setSelected(part ? part.id : null);
    setSelectedLabel(part ? part.label : '');
  }, []);
  const choose = (id) => {
    setSelectedLabel(PART_INFO[id].title);
    setSelected((cur) => (cur === id ? null : id));
  };

  const info = selected ? PART_INFO[selected] : null;

  const row = (id) => {
    const p = PART_INFO[id];
    const missing = available && !available.has(id);
    return (
      <li key={id}>
        <button
          type="button"
          disabled={missing}
          aria-pressed={selected === id}
          title={missing ? 'This part is not in the loaded 3D model' : undefined}
          onClick={() => choose(id)}
          className={`w-full rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
            selected === id ? 'border-[#9bd6ff]/60 bg-[#9bd6ff]/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
          }`}
        >
          <span className="block text-sm font-semibold text-white">{p.title}</span>
          <span className="block text-xs text-[#9aa6ab]">{p.short}</span>
        </button>
      </li>
    );
  };

  return (
    <section id="heart" ref={sectionRef} className="mx-auto max-w-7xl scroll-mt-24 pb-24">
      <h2 className="font-serif text-3xl text-white md:text-4xl">Meet a healthy heart</h2>
      <p className="mt-3 max-w-2xl text-[#9aa6ab]">
        Drag to turn it and scroll to zoom. Hover over any part to see its name, or tap a tag or an item in the list to
        learn what it does. This is how the heart looks when its arteries are open and clear.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <HeartViewer
          educational
          riskLevel="Normal"
          showStatus={false}
          paused={paused || !inView}
          selectedPart={selected}
          onPartSelect={onPartSelect}
          onPartsLoaded={onPartsLoaded}
          className="h-[480px] lg:h-[640px]"
        />

        <div className="space-y-5">
          <div className="min-h-[11rem] rounded-2xl border border-white/10 bg-[#0f1417] p-5">
            {info ? (
              <>
                <h3 className="font-serif text-xl text-white">{info.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#c9c2b8]">{info.what}</p>
                <p className="mt-3 text-sm leading-relaxed text-[#9aa6ab]">{info.why}</p>
                {info.checked && (
                  <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-[#9aa6ab]">
                    This is one of the three arteries the checker below estimates.
                  </p>
                )}
              </>
            ) : selected ? (
              <>
                <h3 className="font-serif text-xl text-white">{selectedLabel || 'Part of the heart'}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#9aa6ab]">
                  A piece of the heart wall or of the blood vessels around it. This 3D model is built from many small
                  pieces, and each one has its own anatomical name.
                </p>
              </>
            ) : (
              <>
                <h3 className="font-serif text-xl text-white">Tap a part to begin</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#9aa6ab]">
                  Start with the three arteries below. They are the ones the patient check estimates later on.
                </p>
              </>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-white">The three arteries the checker looks at</h3>
            <ul className="space-y-2">{CHECKED_ARTERIES.map(row)}</ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-white">Other key parts</h3>
            <ul className="space-y-2">{OTHER_PARTS.map(row)}</ul>
          </div>

          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#9aa6ab]">
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#b9514a' }} />Arteries</li>
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#6a62a0' }} />Veins</li>
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#a65a4f' }} />Heart muscle</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
