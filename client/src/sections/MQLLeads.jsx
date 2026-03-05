import LeadSection from '../components/LeadSection';

export default function MQLLeads() {
  return (
    <LeadSection
      status="SRF/MQL"
      sectionName="MQL Leads"
      agentId="4e01f052-85f8-44d1-820b-d84ae744be43"
      title="Marketing Qualified Leads"
      description="Leads that have interacted with the system and require qualification. Filtered from leads_master where status = 'SRF/MQL'."
      emptyMessage="No MQL leads found."
    />
  );
}
