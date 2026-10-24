import { Link } from "react-router-dom";
import About from "../components/About";
import Skills from "../components/Skills";

function Home({ studentName, studentBio, studentDetails, skillList }) {
  return (
    <div className="page-container home-page">
      <About
        name={studentName}
        bio={studentBio}
        details={studentDetails}
      />
      <Skills skillList={skillList} />

      <section className="portfolio-section featured-cta-section">
        <div className="section-container">
          <div className="cta-grid">
            <div className="cta-card">
              <h3>⚡ In-Memory Caching (node-cache)</h3>
              <p>
                Accelerated with <code>node-cache</code> in-memory key-value caching, 60s TTL, granular write invalidation, and real-time hit/miss analytics.
              </p>
              <Link to="/tasks" className="cta-button">
                Open Cached Task Manager &rarr;
              </Link>
            </div>
            <div className="cta-card">
              <h3>🌐 GitHub API Projects</h3>
              <p>
                Browse live repositories fetched from the official GitHub REST API with memoized client-side filtering.
              </p>
              <Link to="/projects" className="cta-button secondary-cta">
                View API Projects &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Home;
