import fetch from 'node-fetch';
import fs from 'fs';
import { allSpecies } from './species.js';

const PUBLIC_DIR = './public/data';
const TARGET_LIMIT = 1000; // Increased to your new target
const API_PAGE_LIMIT = 300;
const RETRIES = 5;
const DELAY = 5000;

async function fetchWithRetry(url, speciesName) {
    for (let i = 0; i < RETRIES; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.log(`Attempt ${i + 1} for ${speciesName} failed: ${error.message}. Retrying in ${DELAY / 1000}s...`);
            if (i < RETRIES - 1) await new Promise(res => setTimeout(res, DELAY));
        }
    }
    throw new Error(`All fetch attempts failed for ${speciesName}.`);
}

async function main() {
    if (!fs.existsSync(PUBLIC_DIR)) {
        fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    }

    for (const species of allSpecies) {
        console.log(`Fetching up to ${TARGET_LIMIT} points for ${species.commonName}...`);
        let allPoints = [];
        let offset = 0;
        let keepFetching = true;

        while (keepFetching && allPoints.length < TARGET_LIMIT) {
            const scientificName = encodeURIComponent(species.scientificName);
            const url = `https://api.gbif.org/v1/occurrence/search?scientificName=${scientificName}&limit=${API_PAGE_LIMIT}&offset=${offset}&hasCoordinate=true`;
            
            try {
                const data = await fetchWithRetry(url, species.commonName);
                const newPoints = data.results
                    // --- MODIFIED LINE: Ensure 'year' exists before adding the point ---
                    .filter(r => r.decimalLatitude !== null && r.decimalLongitude !== null && r.countryCode !== 'AQ' && r.year)
                    // --- MODIFIED LINE: Add the 'year' to the data point ---
                    .map(r => ({ lat: r.decimalLatitude, lng: r.decimalLongitude, year: r.year }));
                
                allPoints.push(...newPoints);
                
                if (data.endOfRecords || newPoints.length < API_PAGE_LIMIT) {
                    keepFetching = false;
                } else {
                    offset += API_PAGE_LIMIT;
                }

            } catch (error) {
                console.error(`❌ FAILED to fetch data for ${species.commonName}:`, error);
                keepFetching = false;
            }
            await new Promise(res => setTimeout(res, 1000));
        }
        
        const fileName = species.scientificName.toLowerCase().replace(/ /g, '-') + '.json';
        fs.writeFileSync(`${PUBLIC_DIR}/${fileName}`, JSON.stringify(allPoints));
        console.log(`✅ Success! Saved ${allPoints.length} points for ${species.commonName}.`);
    }
    console.log('All species processed.');
}

main();
