import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, User, ArrowRight, Loader2 } from 'lucide-react';

interface PatientListProps {
  onSelect: (patientId: string) => void;
}

export default function PatientList({ onSelect }: PatientListProps) {
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPatients = async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from('patients')
        .select('*')
        .order('name');
      setPatients(data || []);
      setLoading(false);
    };
    fetchPatients();
  }, []);

  const filtered = patients.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.contact?.includes(search)
  );

  return (
    <Card className="glass-card animate-in">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Patient Directory
          </div>
          <Badge variant="secondary" className="text-[10px]">{patients.length} Registered</Badge>
        </CardTitle>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or contact..."
            className="pl-9 h-9 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {search ? 'No patients match your search.' : 'No patients registered yet.'}
          </div>
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-all group cursor-pointer"
              onClick={() => onSelect(p.id)}
            >
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.age}y, {p.gender} {p.contact && `· ${p.contact}`}
                </p>
              </div>
              <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
