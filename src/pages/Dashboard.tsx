import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import PatientForm from '@/components/PatientForm';
import PatientList from '@/components/PatientList';
import FundusUpload from '@/components/FundusUpload';
import ScreeningList from '@/components/ScreeningList';
import DoctorReviewPanel from '@/components/DoctorReviewPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ShieldCheck, LogOut, Stethoscope, UserPlus, 
  Activity, Users, Eye as EyeIcon, AlertTriangle,
  LayoutDashboard, ClipboardList, Search, PlusCircle
} from 'lucide-react';

export default function Dashboard() {
  const { user, hasRole, signOut } = useAuth();
  const [patientId, setPatientId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'patients' | 'screenings' | 'review'>('overview');
  const [selectedScreening, setSelectedScreening] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, high: 0, reviewed: 0, patients: 0 });

  const isDoctor = hasRole('doctor') || hasRole('admin');

  useEffect(() => {
    const fetchStats = async () => {
      const { data: screenings } = await (supabase as any)
        .from('screenings')
        .select('id, ai_results(unified_risk), doctor_reviews(id)');
      
      const { count: patientCount } = await (supabase as any)
        .from('patients')
        .select('id', { count: 'exact', head: true });

      const data = screenings || [];
      setStats({
        total: data.length,
        high: data.filter((s: any) => s.ai_results?.[0]?.unified_risk === 'high').length,
        reviewed: data.filter((s: any) => s.doctor_reviews?.length > 0).length,
        patients: patientCount || 0,
      });
    };
    fetchStats();
  }, [refreshKey]);

  // Navigate to upload when patient is selected
  useEffect(() => {
    if (patientId) {
      setActiveTab('overview');
    }
  }, [patientId]);

  const statsCards = (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-in">
      <Card className="glass-card"><CardContent className="pt-4 pb-3 px-4 text-center">
        <Activity className="w-5 h-5 mx-auto text-primary mb-1" />
        <p className="text-2xl font-bold font-display">{stats.total}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Screenings</p>
      </CardContent></Card>
      <Card className="glass-card"><CardContent className="pt-4 pb-3 px-4 text-center">
        <Users className="w-5 h-5 mx-auto text-primary mb-1" />
        <p className="text-2xl font-bold font-display">{stats.patients}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Patients</p>
      </CardContent></Card>
      <Card className="glass-card"><CardContent className="pt-4 pb-3 px-4 text-center">
        <AlertTriangle className="w-5 h-5 mx-auto text-risk-high mb-1" />
        <p className="text-2xl font-bold font-display">{stats.high}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">High Risk</p>
      </CardContent></Card>
      <Card className="glass-card"><CardContent className="pt-4 pb-3 px-4 text-center">
        <EyeIcon className="w-5 h-5 mx-auto text-risk-low mb-1" />
        <p className="text-2xl font-bold font-display">{stats.reviewed}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Reviewed</p>
      </CardContent></Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col sm:flex-row">
      {/* Sidebar Navigation (Desktop) */}
      <aside className="hidden sm:flex flex-col w-64 glass border-r p-4 gap-2 z-50 overflow-y-auto">
        <div className="flex items-center gap-2 px-2 py-4 mb-4 border-b">
          <ShieldCheck className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-xl font-bold font-display leading-none">Retinex</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Clinical AI Support</p>
          </div>
        </div>

        <nav className="space-y-1">
          <NavBtn active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={<LayoutDashboard size={18} />} label="Dashboard" />
          <NavBtn active={activeTab === 'patients'} onClick={() => setActiveTab('patients')} icon={<Search size={18} />} label="Patients" />
          <NavBtn active={activeTab === 'screenings'} onClick={() => setActiveTab('screenings')} icon={<ClipboardList size={18} />} label="Screenings" />
          {isDoctor && (
            <NavBtn active={activeTab === 'review'} onClick={() => setActiveTab('review')} icon={<Stethoscope size={18} />} label="Review Queue" badge={stats.total - stats.reviewed} />
          )}
        </nav>

        <div className="mt-auto pt-4 border-t">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/40 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user?.email?.[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{user?.email}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{isDoctor ? 'Doctor' : 'Technician'}</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive" onClick={signOut}>
            <LogOut size={18} className="mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="sm:hidden glass sticky top-0 z-40 border-b p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <h1 className="text-lg font-bold font-display">Retinex</h1>
        </div>
        <Button size="icon" variant="ghost" onClick={signOut}><LogOut size={18} /></Button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 max-w-5xl mx-auto w-full">
        {selectedScreening ? (
          <DoctorReviewPanel
            screeningId={selectedScreening}
            onClose={() => { setSelectedScreening(null); setRefreshKey((k) => k + 1); }}
          />
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6 animate-in">
                {statsCards}
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Register/Upload Section */}
                  <div className="space-y-6">
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
                  </div>

                  {/* Recent Activity */}
                  <div className="space-y-6">
                    <ScreeningList
                      refreshKey={refreshKey}
                      onViewScreening={isDoctor ? setSelectedScreening : undefined}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Patients Tab */}
            {activeTab === 'patients' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in">
                <PatientList onSelect={(id) => { setPatientId(id); setActiveTab('overview'); }} />
                <div className="hidden lg:block space-y-4">
                  <div className="p-8 rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center space-y-3 text-muted-foreground">
                    <PlusCircle size={40} className="text-primary/40" />
                    <div>
                      <p className="font-semibold text-foreground">Add New Patient</p>
                      <p className="text-sm">Quickly register a new patient to start a screening.</p>
                    </div>
                    <Button onClick={() => { setPatientId(null); setActiveTab('overview'); }}>Register Now</Button>
                  </div>
                </div>
              </div>
            )}

            {/* Screenings Tab */}
            {activeTab === 'screenings' && (
              <div className="max-w-3xl mx-auto">
                <ScreeningList refreshKey={refreshKey} showAll onViewScreening={isDoctor ? setSelectedScreening : undefined} />
              </div>
            )}

            {/* Review Tab (Doctor Only) */}
            {activeTab === 'review' && isDoctor && (
              <div className="max-w-3xl mx-auto">
                <ScreeningList 
                  refreshKey={refreshKey} 
                  showAll 
                  onViewScreening={setSelectedScreening} 
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="sm:hidden glass border-t flex justify-around p-2 sticky bottom-0 z-40">
        <MobileNavBtn active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={<LayoutDashboard size={20} />} label="Home" />
        <MobileNavBtn active={activeTab === 'patients'} onClick={() => setActiveTab('patients')} icon={<Search size={20} />} label="Search" />
        <MobileNavBtn active={activeTab === 'screenings'} onClick={() => setActiveTab('screenings')} icon={<ClipboardList size={20} />} label="History" />
        {isDoctor && (
          <MobileNavBtn active={activeTab === 'review'} onClick={() => setActiveTab('review')} icon={<Stethoscope size={20} />} label="Review" />
        )}
      </nav>
    </div>
  );
}

// Helper components for local scope
function NavBtn({ active, onClick, icon, label, badge }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        active 
          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 translate-x-1' 
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {icon} {label}
      {badge > 0 && (
        <span className="ml-auto bg-risk-high text-white text-[10px] px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </button>
  );
}

function MobileNavBtn({ active, onClick, icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-1 px-3 rounded-lg transition-all ${
        active ? 'text-primary' : 'text-muted-foreground opacity-70'
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
