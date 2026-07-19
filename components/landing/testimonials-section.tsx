"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, CheckCircle2, Database, ShieldCheck } from "lucide-react";

const proofItems = [
  {
    title: "No blind orders",
    detail: "Execution is split into signal review, simulator, EIP-712 intent, wallet signature, and a live-submit gate.",
    icon: ShieldCheck,
  },
  {
    title: "Live data only",
    detail: "Market assets, ETF flows, hot news, SSI indexes, macro events, SoDEX markets, and chain status come through server routes.",
    icon: Activity,
  },
  {
    title: "Durable state gate",
    detail: "Wallet state and signal history use MongoDB in production; degraded memory mode is surfaced as a readiness warning.",
    icon: Database,
  },
  {
    title: "Deploy checks",
    detail: "The health endpoint reports required env readiness without exposing secrets or spending extra SoSoValue quota.",
    icon: CheckCircle2,
  },
];

export function TestimonialsSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-foreground py-32 text-background lg:py-40">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:72px_72px]"
      />

      <div className="relative z-10 mx-auto max-w-[1400px] px-6 lg:px-12">
        <div className="mb-16 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <span className="mb-4 inline-flex items-center gap-3 font-mono text-sm text-background/40">
              <span className="h-px w-12 bg-background/20" />
              Production proof
            </span>
            <h2
              aria-label="Built for real execution."
              className={`font-display text-5xl leading-[0.95] tracking-tight transition-all duration-1000 md:text-7xl lg:text-[112px] ${
                isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
              }`}
            >
              Built for real
              <br />
              <span className="text-background/40">execution.</span>
            </h2>
          </div>
          <p
            className={`max-w-2xl text-xl leading-relaxed text-background/60 transition-all delay-150 duration-1000 ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            WhaleMind shows the controls a production trading assistant needs: source visibility, wallet ownership,
            persistence checks, and a guarded order path.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {proofItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className={`border border-background/15 bg-background/[0.04] p-6 transition-all duration-700 ${
                  isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
                }`}
                style={{ transitionDelay: `${index * 80 + 200}ms` }}
              >
                <Icon className="mb-8 h-6 w-6 text-whale-accent" />
                <h3 className="font-display text-3xl">{item.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-background/60">{item.detail}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
