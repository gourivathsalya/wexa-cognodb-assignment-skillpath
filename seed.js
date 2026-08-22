import 'dotenv/config';
import { driver, verifyConnection } from './db.js';

// A realistic-ish data-science / AI learning path. Each skill's
// `requires` list points at its direct prerequisite skill ids.
const skills = [
  { id: 'python-basics', name: 'Python Basics', category: 'Programming Foundations', level: 1, requires: [] },
  { id: 'git-basics', name: 'Git & Version Control', category: 'Tools', level: 1, requires: [] },
  { id: 'sql-basics', name: 'SQL Basics', category: 'Data Handling', level: 1, requires: [] },
  { id: 'stats-basics', name: 'Statistics Basics', category: 'Statistics', level: 1, requires: [] },

  { id: 'data-structures', name: 'Data Structures', category: 'Programming Foundations', level: 2, requires: ['python-basics'] },
  { id: 'oop-python', name: 'OOP in Python', category: 'Programming Foundations', level: 2, requires: ['python-basics'] },
  { id: 'pandas', name: 'Pandas', category: 'Data Handling', level: 2, requires: ['python-basics'] },
  { id: 'numpy', name: 'NumPy', category: 'Data Handling', level: 2, requires: ['python-basics'] },
  { id: 'probability', name: 'Probability', category: 'Statistics', level: 2, requires: ['stats-basics'] },
  { id: 'flask-basics', name: 'Flask Web Basics', category: 'Programming Foundations', level: 2, requires: ['oop-python'] },

  { id: 'data-viz', name: 'Data Visualization', category: 'Data Handling', level: 3, requires: ['pandas'] },
  { id: 'hypothesis-testing', name: 'Hypothesis Testing', category: 'Statistics', level: 3, requires: ['probability'] },
  { id: 'api-design', name: 'REST API Design', category: 'Tools', level: 3, requires: ['flask-basics', 'sql-basics'] },
  { id: 'ml-basics', name: 'Machine Learning Basics', category: 'Machine Learning', level: 3, requires: ['numpy', 'probability'] },

  { id: 'supervised-learning', name: 'Supervised Learning', category: 'Machine Learning', level: 4, requires: ['ml-basics'] },
  { id: 'unsupervised-learning', name: 'Unsupervised Learning', category: 'Machine Learning', level: 4, requires: ['ml-basics'] },
  { id: 'model-evaluation', name: 'Model Evaluation', category: 'Machine Learning', level: 4, requires: ['supervised-learning'] },
  { id: 'deep-learning-basics', name: 'Deep Learning Basics', category: 'Deep Learning & NLP', level: 4, requires: ['supervised-learning'] },

  { id: 'nlp-basics', name: 'NLP Basics', category: 'Deep Learning & NLP', level: 5, requires: ['deep-learning-basics'] },
  { id: 'transformers', name: 'Transformers & LLMs', category: 'Deep Learning & NLP', level: 5, requires: ['nlp-basics'] },
];

const courses = [
  { id: 'c-python-101', name: 'Python for Everybody', provider: 'SkillPath Academy', hours: 20, teaches: ['python-basics'] },
  { id: 'c-python-oop', name: 'Python Data Structures & OOP', provider: 'SkillPath Academy', hours: 16, teaches: ['data-structures', 'oop-python'] },
  { id: 'c-pandas-numpy', name: 'Pandas & NumPy for Data Science', provider: 'SkillPath Academy', hours: 14, teaches: ['pandas', 'numpy'] },
  { id: 'c-stats', name: 'Statistics for Data Science', provider: 'SkillPath Academy', hours: 18, teaches: ['stats-basics', 'probability', 'hypothesis-testing'] },
  { id: 'c-ml-intro', name: 'Intro to Machine Learning', provider: 'SkillPath Academy', hours: 24, teaches: ['ml-basics', 'supervised-learning', 'unsupervised-learning'] },
  { id: 'c-eval', name: 'Evaluating ML Models', provider: 'SkillPath Academy', hours: 8, teaches: ['model-evaluation'] },
  { id: 'c-dl', name: 'Applied Deep Learning', provider: 'SkillPath Academy', hours: 22, teaches: ['deep-learning-basics', 'nlp-basics'] },
  { id: 'c-transformers', name: 'Transformers & Large Language Models', provider: 'SkillPath Academy', hours: 20, teaches: ['transformers'] },
  { id: 'c-flask', name: 'Flask & REST APIs', provider: 'SkillPath Academy', hours: 12, teaches: ['flask-basics', 'api-design'] },
  { id: 'c-viz', name: 'Data Visualization Storytelling', provider: 'SkillPath Academy', hours: 10, teaches: ['data-viz'] },
];

async function seed() {
  const ok = await verifyConnection();
  if (!ok) {
    console.error('Could not connect to CognoDB. Check your .env values.');
    process.exit(1);
  }

  const session = driver.session();
  try {
    console.log('Clearing existing data...');
    await session.run('MATCH (n) DETACH DELETE n');

    console.log('Creating uniqueness constraints...');
    await session.run('CREATE CONSTRAINT skill_id IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE');
    await session.run('CREATE CONSTRAINT course_id IF NOT EXISTS FOR (c:Course) REQUIRE c.id IS UNIQUE');

    console.log(`Loading ${skills.length} skills...`);
    await session.run(
      `UNWIND $skills AS skill
       CREATE (s:Skill {id: skill.id, name: skill.name, category: skill.category, level: skill.level})`,
      { skills }
    );

    console.log('Wiring up REQUIRES relationships...');
    await session.run(
      `UNWIND $skills AS skill
       UNWIND skill.requires AS reqId
       MATCH (s:Skill {id: skill.id}), (r:Skill {id: reqId})
       CREATE (s)-[:REQUIRES]->(r)`,
      { skills }
    );

    console.log(`Loading ${courses.length} courses...`);
    await session.run(
      `UNWIND $courses AS course
       CREATE (c:Course {id: course.id, name: course.name, provider: course.provider, hours: course.hours})`,
      { courses }
    );

    console.log('Wiring up TEACHES relationships...');
    await session.run(
      `UNWIND $courses AS course
       UNWIND course.teaches AS skillId
       MATCH (c:Course {id: course.id}), (s:Skill {id: skillId})
       CREATE (c)-[:TEACHES]->(s)`,
      { courses }
    );

    console.log('Seed complete.');
  } finally {
    await session.close();
    await driver.close();
  }
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
