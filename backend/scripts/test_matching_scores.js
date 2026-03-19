import axios from 'axios';

const BACKEND_URL = 'http://localhost:3001/api';

async function testScores() {
  console.log('🧪 Testing V and L scores in AI matching...');

  try {
    // 1. Get an item to recommend for
    const itemsRes = await axios.get(`${BACKEND_URL}/items`);
    const items = itemsRes.data.items;
    if (items.length === 0) {
      console.error('❌ No items in closet to test with.');
      return;
    }
    const targetItem = items[0];
    console.log(`👗 Target item: ${targetItem.subcategory} (${targetItem.id})`);

    // 2. Test Recommendations
    console.log('\n📡 Testing /api/recommend...');
    const recRes = await axios.post(`${BACKEND_URL}/recommend`, { itemId: targetItem.id });
    const recs = recRes.data.recommendations;
    if (recs.length > 0) {
      const first = recs[0];
      console.log(`✅ Rec: ${first.subcategory} | V: ${first.visualSimilarity} | L: ${first.logicScore}`);
      if (first.visualSimilarity === 0 || first.logicScore === 0) {
        console.error('❌ ERROR: Recommendation scores are zero!');
      }
    } else {
      console.log('⚠️ No recommendations returned.');
    }

    // 3. Test Search (Outfit AI)
    console.log('\n📡 Testing /api/search...');
    const searchRes = await axios.post(`${BACKEND_URL}/search`, { query: 'curate a nice outfit' });
    const outfit = searchRes.data.outfit;
    if (outfit && outfit.items && outfit.items.length > 0) {
      console.log(`✅ Outfit: ${outfit.outfitName}`);
      console.log(`📊 Outfit Scores | V: ${outfit.visualCohesion} | L: ${outfit.logicHarmony}`);
      if (outfit.visualCohesion === 0 || outfit.logicHarmony === 0) {
        console.error('❌ ERROR: Outfit cohesion/harmony scores are zero!');
      }
      
      const firstItem = outfit.items[0];
      console.log(`✅ Item 1: ${firstItem.subcategory} | V: ${firstItem.visualSimilarity} | L: ${firstItem.logicScore}`);
    } else {
      console.log('⚠️ No outfit returned from search.');
    }

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

testScores();
