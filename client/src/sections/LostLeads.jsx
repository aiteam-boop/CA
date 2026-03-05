import LeadSection from '../components/LeadSection';

export default function LostLeads() {
  return (
    <LeadSection
      status="Lost"
      sectionName="Lost Leads"
      title="Lost Leads"
      description="Leads that have been marked as lost. Filtered from leads_master where status = 'Lost'."
      emptyMessage="No lost leads found."
    />
  );
}
