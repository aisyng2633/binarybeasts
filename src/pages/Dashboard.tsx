import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import PatientForm from '@/components/PatientForm';
import FundusUpload from '@/components/FundusUpload';
import ScreeningList from '@/components/ScreeningList';
import DoctorReviewPanel from '@/components/DoctorReviewPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck, LogOut, Stethoscope, UserPlus, Activity, Users, Eye as EyeIcon, AlertTriangle } from 'lucide-react';

export default function Dashboard() {
  const { user, hasRole, signOut } = useAuth();
  const [patientId, setPatientId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeView, setActiveView] = useState<'screen' | 'review'>('screen');
  const [selectedScreening, setSelectedScreening] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, high: 0, reviewed: 0, patients: 0 });

  const isDoctor = hasRole('doctor') || hasRole('admin');

  useEffect(() => {
    const fetchStats = async () => {
      const [screenings, patients] = await Promise.all([
        (supabase as any).from('screenings').select('id, status, ai_results(unified_risk), doctor_reviews(id)'),
        (supabase as any).from('patients').select('id', { count: 'exact', head: true }),
      ]);
      const data = screenings.data || [];
      setStats({
        total: data.length,
        high: data.filter((s: any) => s.ai_results?.[0]?.unified_risk === 'high').length,
        reviewed: data.filter((s: any) => s.doctor_reviews?.length > 0).length,
        patients: patients.count || 0,
      });
    };
    fetchStats();
  }, [refreshKey]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-lg font-bold font-display">RetinAI</h1>
            <span className="text-xs text-muted-foreground hidden sm:inline">CDSS</span>
          </div>
          <div className="flex items-center gap-2">
            {isDoctor && (
              <div className="flex bg-muted rounded-lg p-0.5">
                <button
                  onClick={() => { setActiveView('screen'); setSelectedScreening(null); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeView === 'screen' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
                >
                  <UserPlus className="w-3.5 h-3.5 inline mr-1" />Screen
                </button>
                <button
                  onClick={() => { setActiveView('review'); setSelectedScreening(null); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activeView === 'review' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
                >
                  <Stethoscope className="w-3.5 h-3.5 inline mr-1" />Review
                </button>
              </div>
            )}
            <Button size="sm" variant="ghost" onClick={signOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-2xl px-4 py-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4 pb-3 px-4 text-center">
            <Activity className="w-5 h-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold font-display">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Screenings</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 px-4 text-center">
            <Users className="w-5 h-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold font-display">{stats.patients}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Patients</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 px-4 text-center">
            <AlertTriangle className="w-5 h-5 mx-auto text-risk-high mb-1" />
            <p className="text-2xl font-bold font-display">{stats.high}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">High Risk</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 px-4 text-center">
            <EyeIcon className="w-5 h-5 mx-auto text-risk-low mb-1" />
            <p className="text-2xl font-bold font-display">{stats.reviewed}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Reviewed</p>
          </CardContent></Card>
        </div>

        {selectedScreening ? (
          <DoctorReviewPanel
            screeningId={selectedScreening}
            onClose={() => { setSelectedScreening(null); setRefreshKey((k) => k + 1); }}
          />
        ) : activeView === 'screen' ? (
          <>
            {!patientId ? (
              <PatientForm onPatientCreated={setPatientId} />
            ) : (
              <FundusUpload
                patientId={patientId}
                onScreeningCreated={() => {
                  setRefreshKey((k) => k + 1);
                  setPatientId(null);
                }}
              />
            )}
            <ScreeningList
              refreshKey={refreshKey}
              onViewScreening={isDoctor ? setSelectedScreening : undefined}
            />
          </>
        ) : (
          <ScreeningList
            refreshKey={refreshKey}
            onViewScreening={setSelectedScreening}
            showAll
          />
        )}
      </main>
    </div>
  );
}
