'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Sparkles, FileText, Bot, Zap, Clock, ShieldCheck, Search, LayoutDashboard, Target, Layers, ArrowRight, BarChart3, Globe, Code } from 'lucide-react';

interface LandingStoryProps {
  onGetStarted: () => void;
  onLogin: () => void;
}

export default function LandingStory({ onGetStarted, onLogin }: LandingStoryProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  return (
    <div className="bg-white text-slate-900 overflow-x-hidden font-sans selection:bg-slate-900 selection:text-white">
      {/* ──────────────────────────────────────────────────────────── */}
      {/* SECTION 1: HERO */}
      {/* ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[90vh] flex flex-col justify-center items-center px-4 overflow-hidden pt-32 pb-20">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] -z-20"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-slate-100 to-indigo-50 rounded-full blur-3xl -z-10 opacity-60"></div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center z-10 w-full max-w-5xl mx-auto"
        >
          <div className="mb-8 flex justify-center">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-200/80 bg-white/60 backdrop-blur-md shadow-sm text-sm font-semibold text-slate-800 hover:bg-white transition-colors cursor-default">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              The Future of Job Applications is Here
            </span>
          </div>

          <h1 className="text-6xl sm:text-7xl md:text-9xl font-black tracking-tighter text-slate-900 drop-shadow-sm mb-6 leading-[1.05]">
            Outsmart the <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-800 via-slate-600 to-black">Algorithm.</span>
          </h1>

          <p className="text-xl md:text-2xl text-slate-500 font-medium max-w-2xl mx-auto mb-12 tracking-tight leading-relaxed">
            Career Copilot turns your master resume into a targeted, ATS-beating powerhouse for every single application. Automatically.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onGetStarted}
              className="bg-slate-900 text-white px-10 py-5 rounded-full font-bold text-lg hover:bg-slate-800 hover:scale-[1.02] transition-all shadow-2xl shadow-slate-900/20 flex items-center gap-3 group w-full sm:w-auto"
            >
              Start for Free
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={onLogin}
              className="px-10 py-5 rounded-full font-bold text-lg text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm w-full sm:w-auto"
            >
              Log In
            </button>
          </div>

          {/* Social Proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 1 }}
            className="mt-20 pt-10 border-t border-slate-200/60"
          >
            <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-6">Engineered to land interviews at top companies</p>
            <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-50 grayscale">
              {['Google', 'Meta', 'Stripe', 'Netflix', 'Amazon'].map(company => (
                <span key={company} className="text-xl md:text-2xl font-black tracking-tight text-slate-800">{company}</span>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* SECTION 2: THE PROBLEM (Redesigned - Dense & Vertical) */}
      {/* ──────────────────────────────────────────────────────────── */}
      <section className="bg-slate-950 text-white py-32 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 to-black opacity-80"></div>

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
              className="space-y-8"
            >
              <h2 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tighter leading-tight">
                Job hunting is <span className="text-red-400">broken.</span>
              </h2>
              <p className="text-xl text-slate-400 leading-relaxed font-medium">
                You spend hours meticulously crafting the perfect resume, only to be instantly rejected by an automated Applicant Tracking System because you missed a single arbitrary keyword in their job description.
              </p>

              <div className="space-y-6 pt-4">
                {[
                  { title: "The Black Hole", desc: "80% of resumes are rejected by ATS algorithms before a human ever sees them.", icon: ShieldCheck, color: "text-red-400", bg: "bg-red-900/20" },
                  { title: "The Time Sink", desc: "You waste hours tweaking a single resume to match different roles.", icon: Clock, color: "text-amber-400", bg: "bg-amber-900/20" },
                  { title: "The Disconnect", desc: "You have the actual skills, but your past job titles don't parse correctly.", icon: Target, color: "text-blue-400", bg: "bg-blue-900/20" },
                ].map(item => (
                  <div key={item.title} className="flex gap-4 items-start">
                    <div className={`p-3 rounded-xl ${item.bg}`}>
                      <item.icon className={`w-6 h-6 ${item.color}`} />
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-slate-200 mb-1">{item.title}</h4>
                      <p className="text-slate-400">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="bg-[#0D1117] rounded-3xl border border-slate-800 p-8 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 blur-3xl rounded-full"></div>
              <div className="relative z-10 flex flex-col gap-6">

                {/* Mock Application Pipeline Visual */}
                <div className="space-y-3">
                  <div className="flex justify-between text-sm text-slate-400 font-bold tracking-wider uppercase mb-2">
                    <span>Candidates</span>
                    <span>Status</span>
                  </div>

                  {[
                    { name: "S. Developer", status: "Rejected by ATS", color: "text-red-400", bg: "bg-red-900/30 border-red-900/50" },
                    { name: "J. Engineer", status: "Rejected by ATS", color: "text-red-400", bg: "bg-red-900/30 border-red-900/50" },
                    { name: "A. Programmer", status: "Rejected by ATS", color: "text-red-400", bg: "bg-red-900/30 border-red-900/50" },
                    { name: "Career Copilot User", status: "Passed to Recruiter", color: "text-emerald-400", bg: "bg-emerald-900/30 border-emerald-900/50 shadow-[0_0_15px_rgba(52,211,153,0.1)]" },
                  ].map((row, i) => (
                    <div key={i} className={`flex items-center justify-between p-4 rounded-xl border ${row.bg}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                          <Bot className="w-4 h-4 text-slate-400" />
                        </div>
                        <span className="font-semibold text-white">{row.name}</span>
                      </div>
                      <span className={`text-sm font-bold uppercase tracking-wide ${row.color}`}>{row.status}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-6 text-center border-t border-slate-800">
                  <p className="text-slate-400 italic">"Career Copilot completely reverses the dynamic. It writes resumes designed specifically for the machines reading them."</p>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* SECTION 3: THE SOLUTION (Vertical Storytelling Setup) */}
      {/* ──────────────────────────────────────────────────────────── */}
      <section className="bg-slate-50 py-32 px-4 border-b border-slate-200">
        <div className="max-w-4xl mx-auto text-center mb-24">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6 }}
            className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 mb-6 leading-tight"
          >
            Meet your unfair <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-600">advantage.</span>
          </motion.h2>
          <p className="text-xl text-slate-500 font-medium">A seamless vertical pipeline from discovery to hired. Stop fighting the tools, start letting them work for you.</p>
        </div>

        <div className="max-w-5xl mx-auto space-y-32">

          {/* Step 1 */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
            className="flex flex-col md:flex-row gap-12 items-center"
          >
            <div className="md:w-1/2 order-2 md:order-1 relative">
              <div className="absolute inset-0 bg-indigo-200 blur-3xl rounded-full opacity-30 transform -translate-x-4"></div>
              <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-200 relative z-10 w-full">
                <div className="flex items-center gap-3 mb-6 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <Search className="w-5 h-5 text-slate-400" />
                  <span className="text-slate-500 font-mono text-sm">Paste remote job URL...</span>
                </div>
                <div className="space-y-4">
                  <div className="h-16 bg-gradient-to-r from-indigo-50 to-white border border-indigo-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex gap-4 items-center">
                      <div className="w-8 h-8 rounded-md bg-indigo-500 flex items-center justify-center text-white"><Code className="w-4 h-4" /></div>
                      <div><div className="h-3 w-32 bg-indigo-900/20 rounded mb-2"></div><div className="h-2 w-20 bg-indigo-900/10 rounded"></div></div>
                    </div>
                    <div className="px-3 py-1 bg-white border border-indigo-200 text-indigo-700 text-xs font-bold rounded-full">Scraped</div>
                  </div>
                  <div className="h-16 bg-slate-50 border border-slate-100 rounded-xl"></div>
                </div>
              </div>
            </div>
            <div className="md:w-1/2 order-1 md:order-2 space-y-6">
              <span className="text-indigo-600 font-bold tracking-wider uppercase text-sm border border-indigo-200 bg-indigo-50 px-3 py-1 rounded-full">Step 1</span>
              <h3 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 leading-tight">Aggregate infinite opportunities.</h3>
              <p className="text-xl text-slate-500 leading-relaxed">Don't rely on generic job boards. We aggregate high-quality remote and on-site opportunities directly into your dashboard. Or, simply paste any URL from Greenhouse, Lever, or LinkedIn.</p>
            </div>
          </motion.div>

          {/* Step 2 */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
            className="flex flex-col md:flex-row gap-12 items-center"
          >
            <div className="md:w-1/2 space-y-6">
              <span className="text-emerald-600 font-bold tracking-wider uppercase text-sm border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-full">Step 2</span>
              <h3 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 leading-tight">Instant AI Match Scoring.</h3>
              <p className="text-xl text-slate-500 leading-relaxed">Before you apply, our intelligence models cross-reference your master profile with the job description. Know exactly what skills you're missing and your true probability of getting an interview.</p>
            </div>
            <div className="md:w-1/2 relative flex justify-center">
              <div className="w-72 h-72 rounded-full border-[16px] border-slate-100 flex items-center justify-center relative shadow-lg bg-white">
                <div className="absolute inset-0 rounded-full border-[16px] border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.3)]" style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 50%, 50% 50%, 50% 0, 0 0)" }}></div>
                <div className="text-center">
                  <div className="text-7xl font-black text-slate-900">92%</div>
                  <div className="text-emerald-500 font-bold tracking-widest uppercase mt-2">Match</div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Step 3 */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
            className="flex flex-col md:flex-row gap-12 items-center"
          >
            <div className="md:w-1/2 order-2 md:order-1 flex justify-center relative">
              <div className="absolute inset-0 bg-blue-200 blur-3xl rounded-full opacity-30 transform translate-y-4"></div>
              <div className="bg-white border-2 border-slate-900 rounded-2xl shadow-2xl p-8 relative z-10 w-full max-w-sm flex flex-col items-center transform -rotate-2 hover:rotate-0 transition-transform">
                <FileText className="w-16 h-16 text-blue-600 mb-6" />
                <div className="w-full space-y-3 opacity-60">
                  <div className="h-3 w-3/4 bg-slate-800 rounded"></div>
                  <div className="h-3 w-full bg-slate-300 rounded"></div>
                  <div className="h-3 w-5/6 bg-blue-500 rounded"></div>
                  <div className="h-3 w-full bg-slate-300 rounded"></div>
                  <div className="h-3 w-4/5 bg-blue-500 rounded"></div>
                </div>
                <div className="mt-8 bg-slate-900 text-white w-full py-4 rounded-xl text-center font-bold shadow-lg">Download PDF</div>
              </div>
            </div>
            <div className="md:w-1/2 order-1 md:order-2 space-y-6">
              <span className="text-blue-600 font-bold tracking-wider uppercase text-sm border border-blue-200 bg-blue-50 px-3 py-1 rounded-full">Step 3</span>
              <h3 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 leading-tight">Hyper-targeted variations.</h3>
              <p className="text-xl text-slate-500 leading-relaxed">Click one button to spawn a custom PDF resume. We perfectly rewrite your bullet points to naturally inject the exact ATS keywords the company is searching for.</p>
            </div>
          </motion.div>

          {/* Step 4 */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
            className="flex flex-col md:flex-row gap-12 items-center"
          >
            <div className="md:w-1/2 space-y-6">
              <span className="text-purple-600 font-bold tracking-wider uppercase text-sm border border-purple-200 bg-purple-50 px-3 py-1 rounded-full">Step 4</span>
              <h3 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 leading-tight">Master your pipeline.</h3>
              <p className="text-xl text-slate-500 leading-relaxed">Never lose track of an opportunity. A built-in Kanban board automatically logs every tailored resume you've sent, alongside your interview prep kits and cold emails.</p>
            </div>
            <div className="md:w-1/2 relative bg-slate-900 rounded-3xl p-8 shadow-2xl">
              <div className="flex gap-4 w-full">
                {[
                  { title: "Saved", items: 2 },
                  { title: "Applied", items: 3, active: true },
                  { title: "Interview", items: 1 }
                ].map(col => (
                  <div key={col.title} className="flex-1 bg-slate-800/80 rounded-xl p-3 border border-slate-700">
                    <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{col.title}</div>
                    <div className="space-y-3">
                      {Array.from({ length: col.items }).map((_, i) => (
                        <div key={i} className={`bg-slate-700 h-10 sm:h-16 rounded-lg opacity-80 ${col.active && i === 0 ? 'ring-2 ring-purple-500 bg-purple-900/30' : ''}`}></div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* SECTION 4: BENTO BOX FEATURES (Refined padding) */}
      {/* ──────────────────────────────────────────────────────────── */}
      <section className="py-32 px-4 md:px-12 max-w-7xl mx-auto bg-white">
        <div className="text-center mb-20 text-slate-900">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-7xl font-black tracking-tighter"
          >
            A powerhouse of <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-400 to-slate-600">intelligent tools.</span>
          </motion.h2>
          <p className="mt-6 text-xl text-slate-500 max-w-2xl mx-auto font-medium">Everything you need to confidently stand out in a crowded market, neatly packed into one platform.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[auto]">

          {/* Bento Item 1 - Large */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-[2rem] p-10 flex flex-col justify-between overflow-hidden relative group"
          >
            <div className="relative z-10 w-full max-w-md">
              <Bot className="w-12 h-12 text-indigo-600 mb-6" />
              <h3 className="text-3xl font-black tracking-tight mb-4">Mock Interview Generator</h3>
              <p className="text-lg text-slate-500 mb-6">Instantly generates 5 highly specific interview questions and suggested bullet points based on the exact job description and your unique background.</p>
            </div>
            {/* Background design element */}
            <div className="absolute right-0 bottom-0 translate-x-1/4 translate-y-1/4 w-96 h-96 bg-indigo-100 rounded-full blur-3xl opacity-50 transition-transform group-hover:scale-110"></div>
          </motion.div>

          {/* Bento Item 2 - Small */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-slate-900 text-white rounded-[2rem] p-10 flex flex-col overflow-hidden relative group"
          >
            <Zap className="w-12 h-12 text-yellow-400 mb-6" />
            <h3 className="text-3xl font-black tracking-tight mb-4">Cold Emails</h3>
            <p className="text-slate-400 text-lg">AI writes punchy, context-aware outreach emails to recruiters on LinkedIn.</p>
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-yellow-500/20 blur-2xl rounded-full"></div>
          </motion.div>

          {/* Bento Item 3 - Small */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="border border-slate-200 bg-white rounded-[2rem] p-10 flex flex-col group hover:border-slate-300 hover:shadow-xl transition-all"
          >
            <Layers className="w-12 h-12 text-emerald-500 mb-6" />
            <h3 className="text-3xl font-black tracking-tight mb-4 text-slate-900">Cover Letters</h3>
            <p className="text-slate-500 text-lg">Perfectly formatted cover letters matching the tone of the company, ready instantly.</p>
          </motion.div>

          {/* Bento Item 4 - Large */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="md:col-span-2 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-[2rem] p-10 flex flex-col md:flex-row items-center gap-10 overflow-hidden relative group"
          >
            <div className="relative z-10 w-full md:w-1/2">
              <Globe className="w-12 h-12 text-blue-600 mb-6" />
              <h3 className="text-3xl font-black tracking-tight mb-4 text-slate-900">Custom Salary & Location Filters</h3>
              <p className="text-lg text-slate-600">The intelligence engine penalizes jobs that don't match your exact financial baseline and remote preferences.</p>
            </div>
            <div className="w-full md:w-1/2 h-48 bg-white border border-slate-200 rounded-xl shadow-lg relative p-6 flex flex-col justify-center">
              <div className="flex items-center justify-between mb-4">
                <span className="font-bold text-slate-700">Min Salary Score</span>
                <span className="text-red-500 font-bold">-20 pts</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-green-500 w-3/4 h-full"></div>
              </div>
            </div>
          </motion.div>

        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* SECTION 5: AI IN ACTION (Mockup) */}
      {/* ──────────────────────────────────────────────────────────── */}
      <section className="py-40 bg-slate-950 text-white overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-4 relative z-10 flex flex-col lg:flex-row items-center gap-20">

          <div className="lg:w-1/3 space-y-8 text-center lg:text-left">
            <h2 className="text-5xl md:text-7xl font-black tracking-tighter leading-tight">Like magic. <br /><span className="text-slate-500">Almost.</span></h2>
            <p className="text-2xl text-slate-400 font-medium leading-relaxed">Watch the intelligence model completely adapt your rigid tech history into a fluid, highly-relevant application tailored exactly for the role.</p>
            <div className="pt-4 hidden lg:block">
              <button
                onClick={onGetStarted}
                className="bg-white text-slate-900 px-8 py-4 rounded-full font-bold text-lg hover:bg-slate-200 transition-colors shadow-lg shadow-white/10"
              >
                Experience it now
              </button>
            </div>
          </div>

          <div className="lg:w-2/3 w-full">
            <motion.div
              initial={{ opacity: 0, y: 50, rotateX: 10 }}
              whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="bg-[#0D1117] rounded-2xl border border-slate-800 p-0 shadow-2xl relative overflow-hidden"
            >
              <div className="bg-[#161B22] flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]"></div>
                </div>
                <div className="font-mono text-xs text-slate-400 font-semibold tracking-wider">career-copilot/engine</div>
                <div className="w-12"></div> {/* Spacer for centering */}
              </div>

              <div className="p-8 font-mono text-sm sm:text-base space-y-6">
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex gap-4 text-slate-300">
                  <span className="text-slate-600 shrink-0">~</span>
                  <p>Analyzing <span className="text-blue-400">`Google Software Engineer III`</span> Job Description...</p>
                </motion.div>

                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 1.5 }} className="flex gap-4 text-slate-300">
                  <span className="text-slate-600 shrink-0">~</span>
                  <p>Detected Missing Keywords: <span className="text-emerald-400">['Kubernetes', 'Microservices', 'gRPC', 'Golang']</span></p>
                </motion.div>

                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 2.5 }} className="flex gap-4">
                  <span className="text-slate-600 shrink-0">~</span>
                  <p className="text-slate-300">Executing strategic bullet point rewrite <span className="text-blue-400 animate-pulse">...</span></p>
                </motion.div>

                <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: 3.5 }} className="flex gap-4 text-slate-300 ml-6 pl-4 border-l-2 border-slate-700">
                  <p className="text-slate-400 line-through mb-2 -ml-2">- Built backend APIs using Java.</p>
                </motion.div>

                <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: 4.0 }} className="flex gap-4 text-slate-300 ml-6 pl-4 border-l-2 border-emerald-500">
                  <p className="text-white bg-emerald-900/20 p-2 rounded border border-emerald-900/50">+ Developed scalable <span className="text-emerald-300 font-bold bg-emerald-900/60 px-1 rounded">microservices</span> using Java and <span className="text-emerald-300 font-bold bg-emerald-900/60 px-1 rounded">gRPC</span>, deploying highly-available clusters securely on <span className="text-emerald-300 font-bold bg-emerald-900/60 px-1 rounded">Kubernetes</span>.</p>
                </motion.div>

                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 5.5 }} className="flex gap-4 pt-6 border-t border-slate-800">
                  <span className="text-emerald-400 font-bold">✔ PDF Compiled. ATS Keyword Coverage: 98%.</span>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* SECTION 6: STATS & SOCIAL PROOF */}
      {/* ──────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 text-center divide-y md:divide-y-0 md:divide-x divide-slate-200">
          <div className="pt-8 md:pt-0">
            <div className="text-6xl md:text-7xl font-black text-slate-900 tracking-tighter mb-4">4x</div>
            <p className="text-xl text-slate-500 font-medium">Increase in Interview <br /> Callback Rates</p>
          </div>
          <div className="pt-8 md:pt-0">
            <div className="text-6xl md:text-7xl font-black text-slate-900 tracking-tighter mb-4">3s</div>
            <p className="text-xl text-slate-500 font-medium">Average Time to <br /> Generate a Perfect PDF</p>
          </div>
          <div className="pt-8 md:pt-0">
            <div className="text-6xl md:text-7xl font-black text-slate-900 tracking-tighter mb-4">98%</div>
            <p className="text-xl text-slate-500 font-medium">Average ATS Parsing <br /> Compatibility Score</p>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* SECTION 7: CTA */}
      {/* ──────────────────────────────────────────────────────────── */}
      <section className="py-40 px-4 bg-white relative overflow-hidden">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-[600px] bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-indigo-100 via-slate-50 to-transparent blur-3xl -z-10 text-center"></div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-5xl mx-auto text-center"
        >
          <div className="mb-8 flex justify-center">
            <div className="w-20 h-20 bg-slate-900 rounded-3xl shadow-2xl shadow-slate-900/30 flex items-center justify-center transform -rotate-12 hover:rotate-0 transition-transform duration-500">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
          </div>

          <h2 className="text-6xl sm:text-7xl md:text-9xl font-black tracking-tighter text-slate-900 mb-8 leading-[1]">
            Stop Applying. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-400 to-slate-600">Start Interviewing.</span>
          </h2>

          <p className="text-xl md:text-2xl text-slate-500 font-medium max-w-2xl mx-auto mb-16 tracking-tight">
            Join the smart candidates who let AI do the heavy lifting. Create your master profile today and beat the algorithm.
          </p>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-6">
            <button
              onClick={onGetStarted}
              className="bg-slate-900 text-white px-12 py-6 rounded-full font-black text-xl md:text-2xl hover:bg-black hover:scale-[1.03] active:scale-[0.98] transition-all shadow-2xl shadow-slate-900/20 w-full sm:w-auto"
            >
              Get Started for Free
            </button>
            <button
              onClick={onLogin}
              className="bg-transparent text-slate-900 font-bold text-xl hover:text-indigo-600 transition-colors py-4 px-6 w-full sm:w-auto"
            >
              Sign into Account →
            </button>
          </div>
        </motion.div>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* FOOTER */}
      {/* ──────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-50 py-12 px-8 border-t border-slate-200">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-slate-500 font-medium">
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-slate-800" />
            <span className="text-slate-800 font-bold tracking-tight text-lg">Career Copilot</span>
          </div>
          <div className="flex gap-8 text-sm">
            <a href="#" className="hover:text-slate-900 transition-colors">Privacy</a>
            <a href="#" className="hover:text-slate-900 transition-colors">Terms</a>
            <a href="#" className="hover:text-slate-900 transition-colors">Contact</a>
          </div>
          <p className="text-sm">© {new Date().getFullYear()} Career Copilot. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
