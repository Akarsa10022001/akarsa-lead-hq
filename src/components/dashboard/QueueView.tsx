import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { CheckCircle2, AlertCircle, Send, Mail, MessageCircle } from "lucide-react";

export default function QueueView() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('outreach_messages')
      .select(`
        id, channel, draft_content, step_number, created_at,
        outreach_sequences!inner(
          leads!inner(id, company_name, contact_name, industry)
        )
      `)
      .eq('status', 'ready_to_send')
      .order('created_at', { ascending: false });
    
    if (data) setMessages(data);
    setLoading(false);
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selected);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelected(newSet);
  };

  const selectAll = () => {
    if (selected.size === messages.length) setSelected(new Set());
    else setSelected(new Set(messages.map(m => m.id)));
  };

  const handleApprove = async () => {
    if (selected.size === 0) return;
    setApproving(true);
    try {
      const res = await fetch('/api/outreach/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: Array.from(selected) })
      });
      if (res.ok) {
        alert("Messages approved for background sending!");
        setSelected(new Set());
        fetchQueue();
      } else {
        alert("Failed to approve messages.");
      }
    } catch (e) {
      console.error(e);
      alert("Error approving messages.");
    } finally {
      setApproving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading queue...</div>;

  if (messages.length === 0) {
    return (
      <div className="p-12 text-center border border-dashed border-border rounded-xl mt-8">
        <CheckCircle2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
        <h3 className="text-xl font-bold">Queue is Empty</h3>
        <p className="text-muted-foreground mt-2">The overnight pipeline has no pending drafts right now.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Approval Queue</h2>
          <p className="text-muted-foreground">Review autonomous drafts before they send.</p>
        </div>
        <button 
          onClick={handleApprove}
          disabled={selected.size === 0 || approving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          Approve {selected.size > 0 ? `(${selected.size})` : ''}
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-lg">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary/50 border-b border-border">
            <tr>
              <th className="p-4 w-12">
                <input type="checkbox" checked={selected.size > 0 && selected.size === messages.length} onChange={selectAll} className="rounded border-border" />
              </th>
              <th className="p-4 font-medium text-muted-foreground">Lead</th>
              <th className="p-4 font-medium text-muted-foreground w-24">Channel</th>
              <th className="p-4 font-medium text-muted-foreground w-16">Touch</th>
              <th className="p-4 font-medium text-muted-foreground">Draft Copy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {messages.map(msg => (
              <tr key={msg.id} className="hover:bg-secondary/20 transition-colors">
                <td className="p-4">
                  <input type="checkbox" checked={selected.has(msg.id)} onChange={() => toggleSelect(msg.id)} className="rounded border-border" />
                </td>
                <td className="p-4 font-medium">
                  {msg.outreach_sequences.leads.company_name}
                  <div className="text-xs text-muted-foreground font-normal">{msg.outreach_sequences.leads.contact_name || 'Founder'}</div>
                </td>
                <td className="p-4">
                  {msg.channel === 'whatsapp' ? <MessageCircle className="w-4 h-4 text-[#25D366]" /> : <Mail className="w-4 h-4 text-blue-500" />}
                </td>
                <td className="p-4 text-muted-foreground text-center">{msg.step_number}</td>
                <td className="p-4 max-w-xs truncate" title={msg.draft_content}>
                  {msg.draft_content}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
