#!/usr/bin/env node


const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'instagram-museinrose102-2026-01-04-JzumtgsY/your_instagram_activity/threads/threads_and_replies.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
const posts = data.text_post_app_text_posts;

// Get image posts
const imagePosts = [];
posts.forEach((p, idx) => {
  const hasImage = p.media && p.media.some(m => m.uri && m.uri.trim());
  if (hasImage) {
    imagePosts.push({
      idx,
      timestamp: p.media[0].creation_timestamp,
      title: p.title
    });
  }
});

// Get link posts
const linkPosts = [];
posts.forEach((p, idx) => {
  if (p.media) {
    p.media.forEach(m => {
      if (!m.uri || m.uri.trim() === '') {
        if (m.title && m.title.toLowerCase().includes('shopee')) {
          linkPosts.push({
            idx,
            timestamp: m.creation_timestamp,
            link: m.title
          });
        }
      }
    });
  }
});

console.log('=== LINK MAPPING ANALYSIS ===\n');
console.log(`Total image posts: ${imagePosts.length}`);
console.log(`Total link posts: ${linkPosts.length}\n`);

// Find unmatched image posts (no link within 2 min window)
const unmatchedImages = [];
imagePosts.forEach(img => {
  let closestLink = null;
  let minDiff = Infinity;
  
  linkPosts.forEach(link => {
    const diff = Math.abs(link.timestamp - img.timestamp);
    if (diff < minDiff) {
      minDiff = diff;
      closestLink = link;
    }
  });
  
  // Check if match is valid (within 2 min after OR 10s before)
  const isValid = closestLink && (
    (closestLink.timestamp >= img.timestamp && minDiff <= 120) ||
    (closestLink.timestamp < img.timestamp && minDiff <= 10)
  );
  
  if (!isValid) {
    unmatchedImages.push({
      ...img,
      closestDiff: minDiff,
      closestIdx: closestLink?.idx
    });
  }
});

console.log(`Unmatched image posts: ${unmatchedImages.length}\n`);

// Sample first 10 unmatched
console.log('=== SAMPLE UNMATCHED IMAGE POSTS ===\n');
unmatchedImages.slice(0, 10).forEach(img => {
  console.log(`Post[${img.idx}] @ ${img.timestamp}`);
  console.log(`  Title: "${img.title || '(no title)'}"`);
  console.log(`  Closest link: ${img.closestDiff}s away (Post[${img.closestIdx}])`);
  console.log('');
});

// Analyze time difference distribution
const diffBuckets = { '0-10s': 0, '10-60s': 0, '60-120s': 0, '120-300s': 0, '>300s': 0 };
unmatchedImages.forEach(img => {
  const diff = img.closestDiff;
  if (diff <= 10) diffBuckets['0-10s']++;
  else if (diff <= 60) diffBuckets['10-60s']++;
  else if (diff <= 120) diffBuckets['60-120s']++;
  else if (diff <= 300) diffBuckets['120-300s']++;
  else diffBuckets['>300s']++;
});

console.log('=== TIME DIFFERENCE DISTRIBUTION ===\n');
Object.entries(diffBuckets).forEach(([bucket, count]) => {
  console.log(`${bucket}: ${count} posts`);
});
