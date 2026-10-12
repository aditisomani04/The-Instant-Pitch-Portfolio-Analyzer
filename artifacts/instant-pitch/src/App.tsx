import { useEffect, useRef, useState, type ReactNode, type DragEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Form } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import NotFound from '@/pages/not-found';
import { useAnalyzePitch, useSpeakPitch } from '@workspace/api-client-react';
import type { PitchAnalysis, PitchAnalysisInput, PortfolioLink, PortfolioLinkKind } from '@workspace/api-client-react';
import { extractResumeText } from '@/lib/resume-extraction';
import {
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  BriefcaseBusiness,
  Check,
  CheckCheck,
  CircleAlert,
  Code2,
  FileText,
  Globe2,
  Github,
  Linkedin,
  LockKeyhole,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

type ResumeFile = { name: string; size: number };
type SourceKind = PortfolioLinkKind;

const sourceOptions: { kind: SourceKind; label: string }[] = [
  { kind: 'github', label: 'GitHub' },
  { kind: 'linkedin', label: 'LinkedIn' },
  { kind: 'website', label: 'Portfolio' },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sourceIcon(kind: SourceKind, size = 15) {
  if (kind === 'github') return <Github size={size} />;
  if (kind === 'linkedin') return <Linkedin size={size} />;
  return <Globe2 size={size} />;
}

function AppLogo() {
  return (
    <a className="brand" href="/" aria-label="Instant Pitch home">
      <span className="brand-mark"><ArrowRight size={18} strokeWidth={2.5} /></span>
      <span>instant pitch</span>
    </a>
  );
}

function Home() {
  const analyze = useAnalyzePitch();
  const speak = useSpeakPitch();
  const [audioUrl, setAudioUrl] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);
  function listen(text: string) {
    speak.mutate({ data: { text } }, {
      onSuccess: (res) => {
        setAudioUrl(`data:${res.mimeType};base64,${res.audioBase64}`);
        window.setTimeout(() => { void audioRef.current?.play().catch(() => undefined); }, 60);
      },
    });
  }
  const form = useForm<PitchAnalysisInput>({ defaultValues: { resumeText: '', links: [] } });
  const resumeText = form.watch('resumeText');
  const links = form.watch('links') ?? [];
  const setResumeText = (value: string) => form.setValue('resumeText', value);
  const setLinks = (next: PortfolioLink[] | ((current: PortfolioLink[]) => PortfolioLink[])) =>
    form.setValue('links', typeof next === 'function' ? next(form.getValues('links') ?? []) : next);
  const [resumeFile, setResumeFile] = useState<ResumeFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [formError, setFormError] = useState('');
  const [phase, setPhase] = useState(0);
  const [copied, setCopied] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileRequestRef = useRef(0);
  const phases = [
    'Reading the story in your experience…',
    'Finding the skills your examples support…',
    'Putting your strengths into your words…',
  ];

  useEffect(() => {
    if (!analyze.isPending) {
      setPhase(0);
      return;
    }
    const interval = window.setInterval(() => setPhase((current) => (current + 1) % phases.length), 1900);
    return () => window.clearInterval(interval);
  }, [analyze.isPending]);

  const result: PitchAnalysis | undefined = analyze.data;
  const cleanResume = resumeText.trim();
  const validLinks = links.filter((link) => link.url.trim());
  const canAnalyze = cleanResume.length >= 80 && cleanResume.length <= 24000 && !analyze.isPending;

  async function loadFile(file?: File) {
    if (!file) return;
    const requestId = ++fileRequestRef.current;
    setFileError('');
    setFormError('');
    setResumeFile({ name: file.name, size: file.size });
    setResumeText('');
    try {
      const extracted = (await extractResumeText(file)).trim();
      if (requestId !== fileRequestRef.current) return;
      if (!extracted) throw new Error('We could not find readable text in that file. Try a text-based PDF or paste the resume instead.');
      setResumeText(extracted.slice(0, 24000));
      if (extracted.trim().length > 24000) {
        setFileError('Your resume text is longer than 24,000 characters. The first 24,000 are ready to analyze.');
      }
    } catch (error) {
      if (requestId !== fileRequestRef.current) return;
      setResumeFile(null);
      setFileError(error instanceof Error ? error.message : 'That file could not be read. Try another file or paste your resume.');
    }
  }

  function clearResume() {
    fileRequestRef.current += 1;
    setResumeFile(null);
    setResumeText('');
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function addLink() {
    if (links.length < 3) setLinks((current) => [...current, { kind: 'github', url: '' }]);
  }

  function updateLink(index: number, updates: Partial<PortfolioLink>) {
    setLinks((current) => current.map((link, itemIndex) => itemIndex === index ? { ...link, ...updates } : link));
  }

  function removeLink(index: number) {
    setLinks((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function submit() {
    setFormError('');
    if (cleanResume.length < 80) {
      setFormError('Add at least 80 characters of resume text so your pitch can be grounded in real examples.');
      return;
    }
    if (cleanResume.length > 24000) {
      setFormError('Keep your resume text under 24,000 characters.');
      return;
    }
    const normalizedLinks: PortfolioLink[] = [];
    for (const link of validLinks) {
      try {
        const url = new URL(link.url.match(/^https?:\/\//i) ? link.url : `https://${link.url}`);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
        normalizedLinks.push({ kind: link.kind, url: url.toString() });
      } catch {
        setFormError(`Use a public HTTPS address for this ${sourceOptions.find((item) => item.kind === link.kind)?.label ?? 'portfolio'} link, without sign-in credentials.`);
        return;
      }
    }
    const input: PitchAnalysisInput = { resumeText: cleanResume, links: normalizedLinks };
    analyze.mutate({ data: input });
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      setCopied('');
      setFormError('Clipboard access is unavailable. Select the text and copy it manually.');
    }
  }

  function resetAnalysis() {
    analyze.reset();
    speak.reset();
    setAudioUrl('');
    setFormError('');
    setCopied('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void loadFile(event.dataTransfer.files[0]);
  }

  return (
    <div className="min-h-[100dvh]">
      <div className="page-shell">
        <header className="topbar">
          <AppLogo />
          <div className="top-note"><span /> A little clarity goes a long way</div>
        </header>

        <section className="hero">
          <div>
            <div className="eyebrow"><Sparkles size={13} /> A clearer way to talk about your work</div>
            <h1>Your experience has a story.<br /><em>Let’s find the words.</em></h1>
            <p>Bring your resume and the places you’ve made things. We’ll help you turn real evidence into a pitch that sounds like you.</p>
          </div>
          <div className="hero-stamp" aria-hidden="true">
            <BookOpenText size={25} strokeWidth={1.5} />
            <span>Your next<br />conversation<br />starts here</span>
          </div>
        </section>

        {analyze.isPending ? (
          <section className="workspace">
            <div className="panel progress-wrap" role="status" aria-live="polite">
              <div className="progress-orbit"><Sparkles size={26} /></div>
              <h2>Finding your through-line</h2>
              <p>{phases[phase]} This usually takes a few moments.</p>
              <div className="progress-lines" aria-hidden="true"><div className="progress-line" /><div className="progress-line" /><div className="progress-line" /></div>
            </div>
            <aside className="panel aside-panel">
              <div className="aside-kicker"><BadgeCheck size={14} /> Thoughtful by design</div>
              <h2>Evidence first.<br />Buzzwords last.</h2>
              <p className="aside-intro">We look for the real work behind your experience, then say it in plain language.</p>
              <div className="aside-quote"><p>“The best pitch doesn’t sound impressive. It sounds true.”</p><span>A good reminder</span></div>
            </aside>
          </section>
        ) : result ? (
          <section className="results" aria-live="polite">
            <div className="results-top">
              <div>
                <div className="eyebrow"><CheckCheck size={13} /> Your story, brought into focus</div>
                <h2>Look what you’ve already done.</h2>
                <p>Six strengths, backed by the work you shared. Make these words your own.</p>
              </div>
              <button className="text-button" type="button" onClick={resetAnalysis} data-testid="button-start-over"><RotateCcw size={14} /> Start over</button>
            </div>
            {formError && <div className="alert" role="alert" data-testid="status-results-error"><CircleAlert size={16} />{formError}</div>}
            <article className="result-card" style={{marginBottom:17}} data-testid="text-brand-summary">
              <div className="result-card-header"><h3>Your personal brand</h3></div>
              <div className="pitch-copy">{result.brandSummary}</div>
            </article>
            <div className="result-grid">
              <article className="result-card">
                <div className="result-card-header">
                  <h3>Your strengths</h3>
                  <span className="result-tag"><Sparkles size={12} /> Grounded in evidence</span>
                </div>
                <div className="strengths-grid">
                  {result.strengths.map((strength, index) => (
                    <div className="strength-card" key={`${strength.name}-${index}`} data-testid={`card-strength-${index}`}>
                      <div className="strength-top"><span className="strength-name">{strength.name}</span><span className={`category-pill ${strength.category === 'soft' ? 'soft' : ''}`}>{strength.category}</span></div>
                      <p className="strength-summary">{strength.summary}</p>
                      <div className="strength-evidence"><b>What points to it</b>{strength.evidence}</div>
                    </div>
                  ))}
                </div>
              </article>
              <div>
                <article className="result-card">
                  <div className="result-card-header"><h3>Your elevator pitch</h3><span className="result-tag"><BriefcaseBusiness size={12} /> Say it out loud</span></div>
                  <div className="pitch-copy">{result.elevatorPitch}</div>
                  <button className="copy-action" type="button" onClick={() => void copyText('pitch', result.elevatorPitch)} data-testid="button-copy-pitch">
                    {copied === 'pitch' ? <Check size={13} /> : <FileText size={13} />}{copied === 'pitch' ? 'Copied' : 'Copy pitch'}
                  </button>
                  <button className="copy-action" type="button" disabled={speak.isPending} onClick={() => listen(result.elevatorPitch)} data-testid="button-listen-pitch">
                    <Volume2 size={13} />{speak.isPending ? 'Creating audio…' : 'Listen to pitch'}
                  </button>
                  {speak.isError && <div className="alert" role="alert" data-testid="status-speak-error"><CircleAlert size={16} /><span>We couldn’t create the audio. <button type="button" className="copy-action" style={{display:'inline-flex',marginTop:0}} onClick={() => listen(result.elevatorPitch)}>Try again</button></span></div>}
                  {audioUrl && <audio ref={audioRef} src={audioUrl} controls style={{width:'100%',marginTop:10}} data-testid="audio-pitch" />}
                  <div className="headline-box">
                    <div className="field-label"><span>LinkedIn headline</span><span className="field-hint">{result.linkedinHeadline.length}/140</span></div>
                    <p className="headline-text">{result.linkedinHeadline}</p>
                    <button className="copy-action" type="button" onClick={() => void copyText('headline', result.linkedinHeadline)} data-testid="button-copy-headline">
                      {copied === 'headline' ? <Check size={13} /> : <FileText size={13} />}{copied === 'headline' ? 'Copied' : 'Copy headline'}
                    </button>
                  </div>
                  <div className="sources-block">
                    <div className="field-label"><span>Sources</span><span className="field-hint">{result.resumeCharacters.toLocaleString()} resume characters</span></div>
                    {result.sources.length ? result.sources.map((source, index) => (
                      <div className="source-row" key={`${source.url}-${index}`} data-testid={`source-row-${index}`}>
                        <div className="source-glyph">{sourceIcon(source.kind)}</div>
                        <div>
                          <a className="source-url" href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
                          <div className="source-meta">{source.status === 'scraped' ? `${source.characters.toLocaleString()} characters read` : 'Not used in your analysis'}{source.note ? ` · ${source.note}` : ''}</div>
                        </div>
                        <span className={`source-state ${source.status}`}><i />{source.status === 'scraped' ? 'Read' : source.status === 'blocked' ? 'Blocked by site' : 'Could not read'}</span>
                      </div>
                    )) : <p className="field-hint">No public links were included in this analysis.</p>}
                  </div>
                  <div className="result-actions">
                    <span className="result-footnote">Keep what feels right. Edit anything that doesn’t.</span>
                    <button className="text-button" type="button" onClick={resetAnalysis} data-testid="button-analyze-another"><RotateCcw size={13} /> New pitch</button>
                  </div>
                </article>
              </div>
            </div>
          </section>
        ) : (
          <main className="workspace">
            <Form {...form}>
            <form className="panel" onSubmit={form.handleSubmit(submit)} noValidate>
              <div className="panel-head">
                <div className="step-label"><span className="step-number">01</span><h2>Start with what you’ve done</h2></div>
                <span className="field-hint">About 2 minutes</span>
              </div>
              <div className="panel-body">
                <div className="field-label"><span>Your resume</span><span className="field-hint">PDF, DOCX, or TXT</span></div>
                <div className={`resume-drop ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
                  <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" aria-label="Choose resume file" data-testid="input-resume-file" onChange={(event) => void loadFile(event.target.files?.[0])} />
                  {resumeFile ? (
                    <div className="file-chip">
                      <span className="file-icon"><FileText size={18} /></span>
                      <span className="file-meta"><span className="file-name">{resumeFile.name}</span><span className="file-size">{formatSize(resumeFile.size)}{resumeText ? ` · ${resumeText.length.toLocaleString()} characters extracted` : ' · reading text…'}</span></span>
                      <button className="icon-button" type="button" aria-label="Remove resume file" data-testid="button-remove-resume" onClick={(event) => { event.preventDefault(); event.stopPropagation(); clearResume(); }}><X size={15} /></button>
                    </div>
                  ) : (
                    <div className="drop-content">
                      <span className="upload-icon"><Upload size={17} /></span>
                      <span className="drop-title">Drop your resume here, or <u>browse files</u></span>
                      <span className="drop-caption">Your file is read in your browser. We send text, never the file.</span>
                    </div>
                  )}
                </div>
                {fileError && <div className="alert" role="alert"><CircleAlert size={16} />{fileError}</div>}
                <div className="resume-or">or paste your resume text</div>
                <textarea className="resume-text" value={resumeText} onChange={(event) => { setResumeText(event.target.value.slice(0, 24000)); setResumeFile(null); setFileError(''); }} placeholder="Paste the text from your resume here. Include projects, work, coursework, and the things you made happen…" aria-label="Resume text" data-testid="input-resume-text" />
                <div className="text-count"><span>{cleanResume.length < 80 ? `${80 - cleanResume.length} more characters needed` : 'Ready when you are'}</span><span>{cleanResume.length.toLocaleString()} / 24,000</span></div>
                <div className="help-note"><ShieldCheck size={13} /> Use the version you’re comfortable sharing. We only need the words that describe your work.</div>

                <div className="links-panel">
                  <div className="links-heading">
                    <div><h3>Bring in more of your work</h3><p>Public links give your story a little more texture.</p></div>
                    <span className="optional-pill">Optional · max 3</span>
                  </div>
                  {links.map((link, index) => (
                    <div className="link-row" key={index}>
                      <div className="link-kind">{sourceIcon(link.kind, 14)}
                        <select aria-label={`Link type ${index + 1}`} value={link.kind} onChange={(event) => updateLink(index, { kind: event.target.value as SourceKind })} data-testid={`select-link-kind-${index}`}>
                          {sourceOptions.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}
                        </select>
                      </div>
                      <input className="link-input" type="url" value={link.url} onChange={(event) => updateLink(index, { url: event.target.value })} placeholder={link.kind === 'github' ? 'github.com/you' : link.kind === 'linkedin' ? 'linkedin.com/in/you' : 'yourportfolio.com'} aria-label={`${sourceOptions.find((item) => item.kind === link.kind)?.label ?? 'Portfolio'} URL`} data-testid={`input-link-url-${index}`} />
                      <button className="icon-button" type="button" aria-label={`Remove link ${index + 1}`} onClick={() => removeLink(index)} data-testid={`button-remove-link-${index}`}><Trash2 size={14} /></button>
                    </div>
                  ))}
                  <button className="add-link" type="button" disabled={links.length >= 3} onClick={addLink} data-testid="button-add-link"><Plus size={14} /> Add a link{links.length > 0 ? ` (${links.length}/3)` : ''}</button>
                </div>

                {formError && <div className="alert" role="alert" data-testid="status-form-error"><CircleAlert size={16} />{formError}</div>}
                {analyze.isError && <div className="alert" role="alert" data-testid="status-analysis-error"><CircleAlert size={16} /><span>{analyze.error.data?.error ?? 'We couldn’t finish that analysis just now. Your resume and links are still here — try again in a moment.'}</span></div>}
                <button className="primary-button" type="submit" disabled={!canAnalyze} data-testid="button-analyze">
                  Find my story <ArrowRight size={16} />
                </button>
                <div className="privacy-line"><LockKeyhole size={12} /> Your file stays on this device. Only extracted text and links are sent.</div>
              </div>
            </form>
            </Form>

            <aside>
              <div className="panel aside-panel">
                <div className="aside-kicker"><Sparkles size={14} /> A small confidence boost</div>
                <h2>You don’t need a perfect career story.</h2>
                <p className="aside-intro">You need a clear way to talk about what you’ve learned, made, and figured out. We’ll help you find it.</p>
                <div className="step-list">
                  <div className="process-step"><span className="process-icon"><FileText size={15} /></span><div><div className="process-name">We read between the lines</div><div className="process-detail">Skills tucked inside projects, classes, and first jobs.</div></div><span className="process-index">01</span></div>
                  <div className="process-step"><span className="process-icon"><Code2 size={15} /></span><div><div className="process-name">We look for proof</div><div className="process-detail">Public work can add helpful context to your resume.</div></div><span className="process-index">02</span></div>
                  <div className="process-step"><span className="process-icon"><BriefcaseBusiness size={15} /></span><div><div className="process-name">You leave with words</div><div className="process-detail">A pitch and a headline to use, shape, or ignore.</div></div><span className="process-index">03</span></div>
                </div>
                <div className="aside-quote"><p>“I’m still figuring it out” is a perfectly good place to start.</p><span>Especially early on</span></div>
              </div>
              <div className="privacy-card"><ShieldCheck size={17} /><div><strong>Private by default</strong><p>Your uploaded file is processed in your browser. Only extracted resume text and the links you add go to the analyzer.</p></div></div>
            </aside>
          </main>
        )}

        <footer className="footer">
          <span><span className="footer-mark">instant pitch</span> · Say what you do, like you.</span>
          <span>Made for the first chapters of a career.</span>
        </footer>
      </div>
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
