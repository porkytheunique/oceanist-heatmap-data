import fetch from 'node-fetch';
import fs from 'fs';
import { allSpecies } from './species.js';

const PUBLIC_DIR = './public/data';
const POINTS_PER_DECADE = 500; // Our new, higher target per decade
const API_PAGE_LIMIT = 300;   // The max the API gives in a single request
const RETRIES = 5;
const DELAY = 5000;

// The time periods we want to ensure we have data for
const DECADES = [
    { name: '2020s', range: '2020,2025' },
    { name: '2010s', range: '2010,2019' },
    { name: '2000s', range: '2000,2009' }
];

async function fetchWithRetry(url, speciesName, decadeName) {
    for (let i = 0; i < RETRIES; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.log(`Attempt ${i + 1} for ${speciesName} (${decadeName}) failed: ${error.message}. Retrying...`);
            if (i < RETRIES - 1) await new Promise(res => setTimeout(res, DELAY));
        }
    }
    throw new Error(`All fetch attempts failed for ${speciesName} (${decadeName}).`);
}

async function main() {
    if (!fs.existsSync(PUBLIC_DIR)) {
        fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    }

    for (const species of allSpecies) {
        console.log(`Fetching data for ${species.commonName}...`);
        let allPointsForSpecies = [];
        
        // Loop through each decade to get a stratified sample
        for (const decade of DECADES) {
            let pointsForDecade = [];
            let offset = 0;
            let keepFetching = true;

            console.log(`  > Fetching up to ${POINTS_PER_DECADE} points for the ${decade.name}...`);
            
            // --- NEW: Pagination loop to get more than 300 points ---
            while (keepFetching && pointsForDecade.length < POINTS_PER_DECADE) {
                const scientificName = encodeURIComponent(species.scientificName);
                const url = `https://api.gbif.org/v1/occurrence/search?scientificName=${scientificName}&limit=${API_PAGE_LIMIT}&offset=${offset}&hasCoordinate=true&year=${decade.range}`;
                
                try {
                    const data = await fetchWithRetry(url, species.commonName, decade.name);
                    const newPoints = data.results
                        .filter(r => r.decimalLatitude !== null && r.decimalLongitude !== null && r.countryCode !== 'AQ' && r.year)
                        .map(r => ({ lat: r.decimalLatitude, lng: r.decimalLongitude, year: r.year }));
                    
                    pointsForDecade.push(...newPoints);
                    
                    if (data.endOfRecords || newPoints.length < API_PAGE_LIMIT) {
                        keepFetching = false; // No more records available
                    } else {
                        offset += API_PAGE_LIMIT; // Go to the next page
                    }

                } catch (error) {
                    console.error(`❌ FAILED to fetch ${decade.name} data for ${species.commonName}:`, error);
                    keepFetching = false; // Stop trying for this decade if an error occurs
                }
                await new Promise(res => setTimeout(res, 500)); // Be polite to the API
            }
            
            allPointsForSpecies.push(...pointsForDecade.slice(0, POINTS_PER_DECADE)); // Add the points for this decade to the total
        }
        
        const fileName = species.scientificName.toLowerCase().replace(/ /g, '-') + '.json';
        fs.writeFileSync(`${PUBLIC_DIR}/${fileName}`, JSON.stringify(allPointsForSpecies));
        console.log(`✅ Success! Saved a total of ${allPointsForSpecies.length} points for ${species.commonName}.\n---`);
    }
    console.log('All species processed.');
}

main();
