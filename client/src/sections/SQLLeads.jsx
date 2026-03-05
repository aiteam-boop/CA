import LeadSection from '../components/LeadSection';

export default function SQLLeads() {
  return (
    <LeadSection
      status="SQL"
      sectionName="SQL Leads"
      agentId="4e01f052-85f8-44d1-820b-d84ae744be43"
      title="Sales Qualified Leads"
      description="Leads that are ready for sales discussion or deal closing. Filtered from leads_master where status = 'SQL'."
      emptyMessage="No SQL leads found."
    />
  );
}
