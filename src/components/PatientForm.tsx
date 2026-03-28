import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';

interface PatientFormProps {
  onPatientCreated: (patientId: string) => void;
}

export default function PatientForm({ onPatientCreated }: PatientFormProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', age: '', gender: '', contact: '', diabetes_history: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).from('patients').insert({
        name: form.name,
        age: parseInt(form.age),
        gender: form.gender,
        contact: form.contact || null,
        diabetes_history: form.diabetes_history || null,
        created_by: user.id,
      }).select('id').single();
      if (error) throw error;
      toast.success('Patient registered');
      onPatientCreated((data as any).id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserPlus className="w-5 h-5 text-primary" />
          Register Patient
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Patient name" required />
            </div>
            <div className="space-y-2">
              <Label>Age *</Label>
              <Input type="number" min={1} max={120} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="Age" required />
            </div>
            <div className="space-y-2">
              <Label>Gender *</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contact</Label>
              <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="+91 98765 43210" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Diabetes History</Label>
            <Textarea value={form.diabetes_history} onChange={(e) => setForm({ ...form, diabetes_history: e.target.value })} placeholder="Type 2 DM, 5 years, on Metformin..." rows={2} />
          </div>
          <Button type="submit" disabled={loading || !form.name || !form.age || !form.gender}>
            {loading ? 'Registering...' : 'Register Patient'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
