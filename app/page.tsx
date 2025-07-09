"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { CSVUploader } from "./fire-enrich/csv-uploader";
import { UnifiedEnrichmentView } from "./fire-enrich/unified-enrichment-view";
import { EnrichmentTable } from "./fire-enrich/enrichment-table";
import { CSVRow, EnrichmentField } from "@/lib/types";
import { FIRE_ENRICH_CONFIG } from "./fire-enrich/config";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function HomePage() {
  const [step, setStep] = useState<'upload' | 'setup' | 'enrichment'>('upload');
  const [csvData, setCsvData] = useState<{
    rows: CSVRow[];
    columns: string[];
  } | null>(null);
  const [emailColumn, setEmailColumn] = useState<string>('');
  const [selectedFields, setSelectedFields] = useState<EnrichmentField[]>([]);
  const [isCheckingEnv, setIsCheckingEnv] = useState(true);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [firecrawlApiKey, setFirecrawlApiKey] = useState<string>('');
  const [openaiApiKey, setOpenaiApiKey] = useState<string>('');
  const [apolloApiKey, setApolloApiKey] = useState<string>('');
  const [isValidatingApiKey, setIsValidatingApiKey] = useState(false);
  const [missingKeys, setMissingKeys] = useState<{
    firecrawl: boolean;
    openai: boolean;
    apollo: boolean;
  }>({ firecrawl: false, openai: false, apollo: false });
  const [pendingCSVData, setPendingCSVData] = useState<{
    rows: CSVRow[];
    columns: string[];
  } | null>(null);

  useEffect(() => {
    const checkEnvironment = async () => {
      try {
        const response = await fetch('/api/check-env');
        if (!response.ok) {
          throw new Error('Failed to check environment');
        }
        const data = await response.json();

        if (!data.environmentStatus.FIRECRAWL_API_KEY) {
          const savedKey = localStorage.getItem('firecrawl_api_key');
          if (savedKey) setFirecrawlApiKey(savedKey);
        }

        if (!data.environmentStatus.OPENAI_API_KEY) {
          const savedKey = localStorage.getItem('openai_api_key');
          if (savedKey) setOpenaiApiKey(savedKey);
        }

        if (!data.environmentStatus.APOLLO_API_KEY) {
          const savedKey = localStorage.getItem('apollo_api_key');
          if (savedKey) setApolloApiKey(savedKey);
        }

      } catch (error) {
        console.error('Error checking environment:', error);
      } finally {
        setIsCheckingEnv(false);
      }
    };

    checkEnvironment();
  }, []);

  const handleCSVUpload = async (rows: CSVRow[], columns: string[]) => {
    const response = await fetch('/api/check-env');
    const data = await response.json();
    const hasFirecrawl = data.environmentStatus.FIRECRAWL_API_KEY || localStorage.getItem('firecrawl_api_key');
    const hasOpenAI = data.environmentStatus.OPENAI_API_KEY || localStorage.getItem('openai_api_key');
    const hasApollo = data.environmentStatus.APOLLO_API_KEY || localStorage.getItem('apollo_api_key');

    if (!hasFirecrawl || !hasOpenAI || !hasApollo) {
      setPendingCSVData({ rows, columns });
      setMissingKeys({
        firecrawl: !hasFirecrawl,
        openai: !hasOpenAI,
        apollo: !hasApollo,
      });
      setShowApiKeyModal(true);
    } else {
      setCsvData({ rows, columns });
      setStep('setup');
    }
  };

  const handleStartEnrichment = (email: string, fields: EnrichmentField[]) => {
    setEmailColumn(email);
    setSelectedFields(fields);
    setStep('enrichment');
  };

  const handleBack = () => {
    if (step === 'setup') {
      setStep('upload');
    } else if (step === 'enrichment') {
      setStep('setup');
    }
  };

  const resetProcess = () => {
    setStep('upload');
    setCsvData(null);
    setEmailColumn('');
    setSelectedFields([]);
  };

  const handleApiKeySubmit = async () => {
    if (missingKeys.firecrawl && !firecrawlApiKey.trim()) {
      toast.error('Please enter a valid Firecrawl API key');
      return;
    }
    if (missingKeys.openai && !openaiApiKey.trim()) {
      toast.error('Please enter a valid OpenAI API key');
      return;
    }
    if (missingKeys.apollo && !apolloApiKey.trim()) {
      toast.error('Please enter a valid Apollo API key');
      return;
    }

    setIsValidatingApiKey(true);

    try {
      if (missingKeys.firecrawl && firecrawlApiKey) {
        const response = await fetch('/api/scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Firecrawl-API-Key': firecrawlApiKey,
          },
          body: JSON.stringify({ url: 'https://example.com' }),
        });
        if (!response.ok) throw new Error('Invalid Firecrawl API key');
        localStorage.setItem('firecrawl_api_key', firecrawlApiKey);
      }

      if (missingKeys.openai && openaiApiKey) {
        localStorage.setItem('openai_api_key', openaiApiKey);
      }

      if (missingKeys.apollo && apolloApiKey) {
        localStorage.setItem('apollo_api_key', apolloApiKey);
      }

      toast.success('API keys saved successfully!');
      setShowApiKeyModal(false);

      if (pendingCSVData) {
        setCsvData(pendingCSVData);
        setStep('setup');
        setPendingCSVData(null);
      }
    } catch (error) {
      toast.error('Invalid Firecrawl API key. Please check and try again.');
      console.error('API key validation error:', error);
    } finally {
      setIsValidatingApiKey(false);
    }
  };

  // =================================================================
  // FIX APPLIED HERE: Define button content as a variable
  // =================================================================
  let modalButtonContent: React.ReactNode;
  if (isValidatingApiKey) {
    modalButtonContent = (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Validating...
        </>
    );
  } else {
    modalButtonContent = 'Submit';
  }


  return (
      <div className="px-4 sm:px-6 lg:px-8 py-4 max-w-7xl mx-auto font-inter">
        <div className="flex justify-between items-center">
          <Link href="https://www.firecrawl.dev/?utm_source=tool-csv-enrichment" target="_blank" rel="noopener noreferrer">
            <Image
                src="/firecrawl-logo-with-fire.png"
                alt="Firecrawl Logo"
                width={113}
                height={24}
            />
          </Link>
          <Button
              asChild
              variant="code"
              className="font-medium flex items-center gap-2"
          >
            <a
                href="https://github.com/mendableai/fire-enrich"
                target="_blank"
                rel="noopener noreferrer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Use this template
            </a>
          </Button>
        </div>

        <div className="text-center pt-8 pb-6">
          <h1 className="text-[2.5rem] lg:text-[3.8rem] text-[#36322F] dark:text-white font-semibold tracking-tight leading-[1.1] opacity-0 animate-fade-up [animation-duration:500ms] [animation-delay:200ms] [animation-fill-mode:forwards]">
          <span className="relative px-1 text-transparent bg-clip-text bg-gradient-to-tr from-red-600 to-yellow-500 inline-flex justify-center items-center">
            Firecrawl
          </span>
            <span className="text-gray-400 mx-2">+</span>
            <span className="relative px-1 text-transparent bg-clip-text bg-gradient-to-tr from-blue-600 to-cyan-500 inline-flex justify-center items-center">
            Apollo
          </span>
          </h1>
          <p className="text-lg text-muted-foreground mt-3 max-w-2xl mx-auto opacity-0 animate-fade-up [animation-duration:500ms] [animation-delay:400ms] [animation-fill-mode:forwards]">
            A new workflow: <span className="font-semibold text-primary">Apollo</span> provides instant structured data, and <span className="font-semibold text-orange-500">Firecrawl</span> handles deep-dive research for any remaining gaps.
          </p>
          <p className="text-sm text-muted-foreground mt-3 opacity-0 animate-fade-up [animation-duration:500ms] [animation-delay:600ms] [animation-fill-mode:forwards]">
            {FIRE_ENRICH_CONFIG.FEATURES.IS_UNLIMITED ?
                'Unlimited enrichment' :
                `Hosted limit: ${FIRE_ENRICH_CONFIG.CSV_LIMITS.MAX_ROWS} rows, ${FIRE_ENRICH_CONFIG.CSV_LIMITS.MAX_COLUMNS} columns • Self-deployment: Unlimited`
            }
          </p>
        </div>

        {isCheckingEnv ? (
            <div className="text-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Initializing...</p>
            </div>
        ) : (
            <div className="bg-[#FBFAF9] p-4 sm:p-6 rounded-lg shadow-sm">
              {step === 'setup' && (
                  <Button
                      variant="code"
                      size="sm"
                      onClick={handleBack}
                      className="mb-4 flex items-center gap-1.5"
                  >
                    <ArrowLeft size={16} />
                    Back
                  </Button>
              )}

              {step === 'upload' && (
                  <CSVUploader onUpload={handleCSVUpload} />
              )}

              {step === 'setup' && csvData && (
                  <UnifiedEnrichmentView
                      rows={csvData.rows}
                      columns={csvData.columns}
                      onStartEnrichment={handleStartEnrichment}
                  />
              )}

              {step === 'enrichment' && csvData && (
                  <>
                    <div className="mb-4">
                      <h2 className="text-xl font-semibold mb-1">Enrichment Results</h2>
                      <p className="text-sm text-muted-foreground">
                        Click on any row to view detailed information
                      </p>
                    </div>
                    <EnrichmentTable
                        rows={csvData.rows}
                        fields={selectedFields}
                        emailColumn={emailColumn}
                    />
                    <div className="mt-6 text-center">
                      <Button
                          variant="orange"
                          onClick={resetProcess}
                      >
                        Start New Enrichment
                      </Button>
                    </div>
                  </>
              )}
            </div>
        )}

        <footer className="py-8 text-center text-sm text-gray-600 dark:text-gray-400">
          <p>
            Powered by{' '}
            <Link href="https://www.firecrawl.dev" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 font-medium">
              Firecrawl
            </Link>
            {' & '}
            <Link href="https://www.apollo.io" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
              Apollo.io
            </Link>
          </p>
        </footer>

        <Dialog open={showApiKeyModal} onOpenChange={setShowApiKeyModal}>
          <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-900">
            <DialogHeader>
              <DialogTitle>API Keys Required</DialogTitle>
              <DialogDescription>
                This tool requires API keys for Firecrawl, OpenAI, and Apollo to enrich your data.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              {missingKeys.firecrawl && (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="firecrawl-key" className="text-sm font-medium">Firecrawl API Key</label>
                    <Input id="firecrawl-key" type="password" placeholder="fc-..." value={firecrawlApiKey} onChange={(e) => setFirecrawlApiKey(e.target.value)} disabled={isValidatingApiKey} />
                  </div>
              )}
              {missingKeys.openai && (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="openai-key" className="text-sm font-medium">OpenAI API Key</label>
                    <Input id="openai-key" type="password" placeholder="sk-..." value={openaiApiKey} onChange={(e) => setOpenaiApiKey(e.target.value)} disabled={isValidatingApiKey} />
                  </div>
              )}
              {missingKeys.apollo && (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="apollo-key" className="text-sm font-medium">Apollo.io API Key</label>
                    <Input id="apollo-key" type="password" placeholder="Your Apollo API Key" value={apolloApiKey} onChange={(e) => setApolloApiKey(e.target.value)} disabled={isValidatingApiKey} />
                  </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowApiKeyModal(false)} disabled={isValidatingApiKey}>
                Cancel
              </Button>
              <Button onClick={handleApiKeySubmit} disabled={isValidatingApiKey} variant="code">
                {modalButtonContent}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}
