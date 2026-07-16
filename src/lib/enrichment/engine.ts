import { EnrichmentProvider, EnrichmentResult } from './provider';
import { SerperProvider } from './serper';
// import { ApolloProvider } from './apollo'; // Placeholder for future tier

const providers: EnrichmentProvider[] = [
  new SerperProvider(),
  // new ApolloProvider() // Fallback tier
];

export async function executeEnrichment(target: any): Promise<EnrichmentResult | null> {
  let mergedData: any = {};
  let mergedProvenance: any = {};
  
  for (const provider of providers) {
    const result = await provider.enrich(target);
    if (result) {
      // Merge found data
      mergedData = { ...mergedData, ...result.data };
      mergedProvenance = { ...mergedProvenance, ...result.provenance };
      
      // If we found what we needed with high enough confidence, we could break early.
      // For now, any hit from the first tier satisfies the requirement.
      if (mergedData.linkedin_url) {
        break;
      }
    }
  }

  if (Object.keys(mergedData).length === 0) return null;

  return {
    data: mergedData,
    provenance: mergedProvenance
  };
}
