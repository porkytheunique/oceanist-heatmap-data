import fetch from 'node-fetch';
import fs from 'fs';
import { allSpecies } from './species.js';

const PUBLIC_DIR = './public/data';
const LIMIT = 1000; // Fetching a larger, richer dataset
const RETRIES = 5;
const DELAY = 5000; // 5 seconds between retries

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
        console.log(`Fetching data for ${species.commonName}...`);
        const scientificName = encodeURIComponent(species.scientificName);
        const url = `https://api.gbif.org/v1/occurrence/search?scientificName=${scientificName}&limit=${LIMIT}&hasCoordinate=true`;
        
        try {
            const data = await fetchWithRetry(url, species.commonName);
            const points = data.results
                .filter(r => r.decimalLatitude !== null && r.decimalLongitude !== null && r.countryCode !== 'AQ')
                .map(r => ({ lat: r.decimalLatitude, lng: r.decimalLongitude }));

            const fileName = species.scientificName.toLowerCase().replace(/ /g, '-') + '.json';
            fs.writeFileSync(`${PUBLIC_DIR}/${fileName}`, JSON.stringify(points));
            console.log(`✅ Success! Saved ${points.length} points for ${species.commonName}.`);

        } catch (error) {
            console.error(`❌ FAILED to fetch data for ${species.commonName}:`, error);
        }
        await new Promise(res => setTimeout(res, 1000)); 
    }
    console.log('All species processed.');
}

main();
