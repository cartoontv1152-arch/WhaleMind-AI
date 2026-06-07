"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowRight, Check, Zap } from "lucide-react";

const plans = [
  {
    name: "Wave 1",
    description: "Working prototype for buildathon submission",
    price: { monthly: 0, annual: 0 },
    features: [
      "SoSoValue live/fallback intelligence",
      "SoDEX market route preview",
      "ValueChain wallet switching",
      "AI signal dashboard",
      "README roadmap",
    ],
    cta: "View prototype",
    highlight: false,
  },
  {
    name: "Wave 2",
    description: "Private beta with alerts and saved desks",
    price: { monthly: 79, annual: 65 },
    features: [
      "Wallet auth and watchlists",
      "MongoDB saved signals",
      "Telegram or Discord alerts",
      "Portfolio-aware risk scoring",
      "Signed SoDEX test orders",
      "Narrative trend pages",
      "Backtested simulator",
    ],
    cta: "Next milestone",
    highlight: true,
  },
  {
    name: "Wave 3",
    description: "Production release for live traders",
    price: { monthly: null, annual: null },
    features: [
      "Live SoDEX execution guard",
      "Advanced whale wallet ranking",
      "Copy-trade strategy templates",
      "Premium AI analyst chat",
      "Multi-asset execution",
      "Team risk approvals",
      "Usage billing",
      "Public launch analytics",
    ],
    cta: "Final product",
    highlight: false,
  },
];

export function PricingSection() {
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
    <section id="pricing" ref={sectionRef} className="relative py-32 lg:py-40">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header - Dramatic offset */}
        <div className="grid lg:grid-cols-12 gap-8 mb-20">
          <div className="lg:col-span-7">
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-8">
              <span className="w-12 h-px bg-foreground/30" />
              Roadmap
            </span>
            <h2 className={`text-6xl md:text-7xl lg:text-[128px] font-display tracking-tight leading-[0.9] transition-all duration-1000 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}>
              Ship in
              <br />
              <span className="text-stroke">waves.</span>
            </h2>
          </div>
          
          <div className="lg:col-span-5 relative p-0 h-96 lg:h-auto">
            {/* Whale image */}
            <div className={`absolute inset-0 pointer-events-none transition-all duration-1000 delay-100 ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}>
              <img
                src="/images/whale.png"
                alt="Organic whale"
                className="w-full h-full object-contain object-center"
              />
            </div>

          </div>
        </div>

        {/* Pricing cards - Horizontal layout with overlap */}
        <div className="relative">
          <div className="grid lg:grid-cols-3 gap-4 lg:gap-0">
            {plans.map((plan, index) => (
              <div
                key={plan.name}
                className={`relative bg-background border transition-all duration-700 ${
                  plan.highlight 
                    ? "border-foreground lg:-mx-2 lg:z-10 lg:scale-105" 
                    : "border-foreground/10 lg:first:-mr-2 lg:last:-ml-2"
                } ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {/* Popular badge */}
                {plan.highlight && (
                  <div className="absolute -top-4 left-8 right-8 flex justify-center">
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background text-xs font-mono uppercase tracking-widest">
                      <Zap className="w-3 h-3" />
                      Current focus
                    </span>
                  </div>
                )}

                <div className="p-8 lg:p-10">
                  {/* Plan header */}
                  <div className="mb-8 pb-8 border-b border-foreground/10">
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-2xl lg:text-3xl font-display mt-2">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
                  </div>

                  {/* Milestone */}
                  <div className="mb-8">
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl lg:text-6xl font-display">
                        {index === 0 ? "Now" : index === 1 ? "Next" : "Final"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 font-mono">
                      {index === 0 ? "May 2026 prototype" : index === 1 ? "Beta milestone" : "Production launch"}
                    </p>
                  </div>

                  {/* Features */}
                  <ul className="space-y-3 mb-10">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="w-4 h-4 text-whale-accent mt-0.5 shrink-0" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <button
                    className={`w-full py-4 flex items-center justify-center gap-2 text-sm font-medium transition-all group ${
                      plan.highlight
                        ? "bg-foreground text-background hover:bg-foreground/90"
                        : "border border-foreground/20 text-foreground hover:border-foreground hover:bg-foreground/5"
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom note with icons */}
        <div className={`mt-20 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 pt-12 border-t border-foreground/10 transition-all duration-1000 delay-500 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-whale-accent" />
              Wallet-gated execution
            </span>
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-whale-accent" />
              SoSoValue intelligence
            </span>
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-whale-accent" />
              SoDEX order intents
            </span>
          </div>
          <a href="#" className="text-sm underline underline-offset-4 hover:text-foreground transition-colors">
            Compare wave scope
          </a>
        </div>
      </div>

      <style jsx>{`
        .text-stroke {
          -webkit-text-stroke: 1.5px currentColor;
          -webkit-text-fill-color: transparent;
        }
      `}</style>
    </section>
  );
}
