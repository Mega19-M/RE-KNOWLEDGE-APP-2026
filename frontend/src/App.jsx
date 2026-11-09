
import { useState, useRef } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  GitBranch,
  ShieldCheck,
  Settings,
  Search,
  Bell,
  Plus,
  UploadCloud,
  ArrowUpRight,
  ArrowRight,
  Clock3,
  AlertTriangle,
  CheckCircle2,
  File,
  MoreHorizontal,
  Sparkles,
  X,
  Download,
  Menu,
  Activity,
  CircleHelp,
  Trash2,
  BrainCircuit,
  ChevronRight,
} from "lucide-react";
import "./App.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["pdf", "txt", "md", "docx"];

const initialProjects = [
  {
    id: 1,
    name: "Student Career Agent",
    description: "AI-powered career guidance and resume platform",
    status: "Active",
    progress: 78,
    files: 12,
    updated: "2 hours ago",
    color: "blue",
  },
  {
    id: 2,
    name: "Disaster Response System",
    description: "Edge AI early warning and rescue network",
    status: "Active",
    progress: 54,
    files: 8,
    updated: "Yesterday",
    color: "purple",
  },
  {
    id: 3,
    name: "Research Knowledge Base",
    description: "Research papers and scientific documentation",
    status: "Review",
    progress: 91,
    files: 16,
    updated: "2 days ago",
    color: "green",
  },
];

const initialInsights = [
  {
    title: "Authentication dependency identified",
    description:
      "The user authentication module depends on the central database service.",
    source: "architecture.md",
    type: "decision",
  },
  {
    title: "Unresolved API integration",
    description:
      "The external API integration is mentioned in project notes but has no confirmed completion.",
    source: "meeting-notes.txt",
    type: "warning",
  },
  {
    title: "Documentation gap detected",
    description:
      "The deployment process does not have a complete documented procedure.",
    source: "project-overview.pdf",
    type: "gap",
  },
];

const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Projects", icon: FolderKanban },
  { label: "Knowledge Sources", icon: FileText },
  { label: "Decision Timeline", icon: GitBranch },
  { label: "Handover Reports", icon: ShieldCheck },
];

function App() {
  const [activePage, setActivePage] = useState("Overview");
  const [projects, setProjects] = useState(initialProjects);
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  const [selectedProject, setSelectedProject] = useState(
    "Student Career Agent"
  );

  const [reportApproved, setReportApproved] = useState(false);

  // Manual knowledge entered by the user
  const [analysisText, setAnalysisText] = useState("");

  // Results returned by FastAPI
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  // Document upload states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const fileInput = useRef(null);

  const totalFiles =
    projects.reduce((sum, project) => sum + project.files, 0) +
    files.length;

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(search.toLowerCase())
  );

  // Return uploaded files belonging to the currently selected project
  const getProjectFiles = () => {
    return files.filter(
      (file) => file.projectName === selectedProject
    );
  };

  // Combine manually entered knowledge and extracted document text
  const getProjectKnowledge = () => {
    const projectFiles = getProjectFiles();

    const documentContent = projectFiles
      .filter((file) => file.content)
      .map(
        (file) =>
          `DOCUMENT: ${file.name}\n\n${file.content}`
      );

    return [
      analysisText.trim(),
      ...documentContent,
    ]
      .filter(Boolean)
      .join("\n\n========================================\n\n");
  };

  // Upload selected documents to FastAPI
  const uploadFiles = async (uploadedFiles) => {
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return;
    }

    setUploadError("");
    setIsUploading(true);

    const validFiles = [];
    const errors = [];

    // Validate file types and sizes before uploading
    uploadedFiles.forEach((file) => {
      const extension = file.name
        .split(".")
        .pop()
        .toLowerCase();

      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        errors.push(
          `${file.name}: Unsupported file type.`
        );
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        errors.push(
          `${file.name}: File exceeds the 10 MB limit.`
        );
        return;
      }

      validFiles.push(file);
    });

    if (validFiles.length === 0) {
      setUploadError(errors.join(" "));
      setIsUploading(false);
      return;
    }

    const successfulUploads = [];

    // Upload files one by one
    for (const file of validFiles) {
      try {
        const formData = new FormData();

        formData.append("file", file);
        formData.append("project_name", selectedProject);

        const response = await fetch(
          `${API_URL}/upload`,
          {
            method: "POST",
            body: formData,
          }
        );

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            result?.detail ||
            `Server returned ${response.status}`;

          throw new Error(
            typeof message === "string"
              ? message
              : JSON.stringify(message)
          );
        }

        if (
          !result ||
          typeof result.content !== "string"
        ) {
          throw new Error(
            "The backend did not return extracted document text."
          );
        }

        successfulUploads.push({
          id: Date.now() + Math.random(),
          name: result.filename || file.name,
          size: (file.size / 1024).toFixed(1) + " KB",
          status: "Extracted",
          projectName:
            result.project_name || selectedProject,
          content: result.content,
          wordCount: result.word_count || 0,
        });
      } catch (error) {
        console.error(
          `Upload error for ${file.name}:`,
          error
        );

        errors.push(
          `${file.name}: ${error.message.includes("Failed to fetch")
            ? "Cannot connect to FastAPI. Check that your backend is running."
            : error.message
          }`
        );
      }
    }

    if (successfulUploads.length > 0) {
      setFiles((previous) => [
        ...previous,
        ...successfulUploads,
      ]);

      setAnalysisResult(null);
      setAnalysisError("");
    }

    if (errors.length > 0) {
      setUploadError(errors.join("\n"));
    }

    setIsUploading(false);
    setShowUpload(false);
  };

  // File picker handler
  const handleUpload = async (event) => {
    const uploadedFiles = Array.from(
      event.target.files || []
    );

    // Reset input so the same file can be selected again
    event.target.value = "";

    await uploadFiles(uploadedFiles);
  };

  // Drag-and-drop handler
  const handleDrop = async (event) => {
    event.preventDefault();

    const droppedFiles = Array.from(
      event.dataTransfer.files || []
    );

    await uploadFiles(droppedFiles);
  };

  const addProject = () => {
    const newProject = {
      id: Date.now(),
      name: `New Project ${projects.length + 1}`,
      description: "Add your project description",
      status: "Active",
      progress: 0,
      files: 0,
      updated: "Just now",
      color: "blue",
    };

    setProjects((previous) => [
      newProject,
      ...previous,
    ]);

    setActivePage("Projects");
    setSelectedProject(newProject.name);
  };

  const removeFile = (id) => {
    setFiles((previous) =>
      previous.filter((file) => file.id !== id)
    );

    setAnalysisResult(null);
    setAnalysisError("");
  };

  const pageTitles = {
    Overview: {
      title: "Welcome to RE:KNOWLEDGE",
      subtitle:
        "Your team's knowledge, decisions and project history — all in one place.",
    },
    Projects: {
      title: "Your Projects",
      subtitle:
        "Manage your projects and preserve their institutional knowledge.",
    },
    "Knowledge Sources": {
      title: "Knowledge Sources",
      subtitle:
        "Upload and organize the information that powers your knowledge base.",
    },
    "Decision Timeline": {
      title: "Decision Timeline",
      subtitle:
        "Explore important decisions, milestones and project events.",
    },
    "Handover Reports": {
      title: "Handover Reports",
      subtitle:
        "Prepare, review and approve project knowledge transfers.",
    },
    Settings: {
      title: "Settings",
      subtitle: "Manage your workspace preferences.",
    },
  };

  const currentTitle =
    pageTitles[activePage] || pageTitles.Overview;

  const generateReport = () => {
    setReportApproved(false);
    setShowReport(true);
  };

  // Send manual and extracted knowledge to FastAPI
  const handleAnalyze = async () => {
    const combinedKnowledge = getProjectKnowledge();

    if (!combinedKnowledge.trim()) {
      setAnalysisError(
        "Please enter project knowledge or upload a document before analyzing."
      );
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError("");
    setAnalysisResult(null);

    try {
      const response = await fetch(
        `${API_URL}/analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            project_name: selectedProject,
            content: combinedKnowledge,
          }),
        }
      );

      if (!response.ok) {
        const errorMessage = await response.text();

        throw new Error(
          `Server returned ${response.status}: ${errorMessage}`
        );
      }

      const result = await response.json();

      if (
        !Array.isArray(result.decisions) ||
        !Array.isArray(result.blockers) ||
        !Array.isArray(result.risks)
      ) {
        throw new Error(
          "Unexpected analysis response from backend."
        );
      }

      setAnalysisResult(result);
    } catch (error) {
      console.error("Analysis error:", error);

      setAnalysisError(
        error.message.includes("Failed to fetch")
          ? "Cannot connect to FastAPI. Make sure your backend is running at http://127.0.0.1:8000."
          : error.message
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Download the complete project handover report
  const downloadReport = () => {
    const combinedKnowledge = getProjectKnowledge();
    const projectFiles = getProjectFiles();

    const report = `
RE:KNOWLEDGE
PROJECT HANDOVER REPORT

Project: ${selectedProject}
Generated: ${new Date().toLocaleString()}

========================================
1. PROJECT OVERVIEW
========================================

This report summarizes the available project knowledge.

========================================
2. KNOWLEDGE SOURCES
========================================

${
  projectFiles
    .map((file) => `- ${file.name} (${file.wordCount} words)`)
    .join("\n") ||
  "No uploaded documents yet."
}

========================================
3. ORIGINAL PROJECT KNOWLEDGE
========================================

${combinedKnowledge || "No project knowledge submitted."}

========================================
4. AI ANALYSIS RESULTS
========================================

${
  analysisResult
    ? `
SUMMARY:
${analysisResult.summary}

DECISIONS:
${
  analysisResult.decisions.map((item) => "- " + item).join("\n") ||
  "None identified."
}

BLOCKERS:
${
  analysisResult.blockers.map((item) => "- " + item).join("\n") ||
  "None identified."
}

RISKS:
${
  analysisResult.risks.map((item) => "- " + item).join("\n") ||
  "None identified."
}

STATUS:
${analysisResult.status}
`
    : "Analysis has not been performed yet."
}

========================================
5. HUMAN REVIEW
========================================

${reportApproved ? "Approved by reviewer" : "Pending human review"}

========================================
Generated by RE:KNOWLEDGE
========================================
`;

    const blob = new Blob([report], {
      type: "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      "RE-KNOWLEDGE-Handover-Report.txt";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  // Display illustrative dashboard insights
  const renderInsights = () => (
    <div className="insight-list">
      {initialInsights.map((insight, index) => (
        <div className="insight-item" key={index}>
          <div className={`insight-icon ${insight.type}`}>
            {insight.type === "decision" ? (
              <CheckCircle2 size={18} />
            ) : insight.type === "warning" ? (
              <AlertTriangle size={18} />
            ) : (
              <FileText size={18} />
            )}
          </div>

          <div className="insight-content">
            <h4>{insight.title}</h4>
            <p>{insight.description}</p>
            <span className="source-link">
              <File size={12} /> {insight.source}
            </span>
          </div>
        </div>
      ))}
    </div>
  );

  // Display actual results returned by FastAPI
  const renderAnalysisResults = () => {
    if (!analysisResult) return null;

    const sections = [
      {
        title: "Decisions",
        items: analysisResult.decisions,
        icon: <CheckCircle2 size={16} />,
      },
      {
        title: "Blockers",
        items: analysisResult.blockers,
        icon: <AlertTriangle size={16} />,
      },
      {
        title: "Risks",
        items: analysisResult.risks,
        icon: <AlertTriangle size={16} />,
      },
    ];

    return (
      <div className="analysis-results">
        <div className="analysis-results-heading">
          <div>
            <h3>Analysis Results</h3>
            <p>{analysisResult.summary}</p>
          </div>

          <span className="uploaded-status">
            <CheckCircle2 size={14} /> Complete
          </span>
        </div>

        {sections.map((section) => (
          <div
            className="analysis-result-section"
            key={section.title}
          >
            <h4>{section.title}</h4>

            {section.items.length > 0 ? (
              section.items.map((item, index) => (
                <p key={index}>
                  {section.icon}
                  <span>{item}</span>
                </p>
              ))
            ) : (
              <p className="analysis-empty">
                No {section.title.toLowerCase()} identified.
              </p>
            )}
          </div>
        ))}
      </div>
    );
  };

  const projectFiles = getProjectFiles();

  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <aside
        className={`sidebar ${
          mobileMenu ? "sidebar-open" : ""
        }`}
      >
        <div className="brand">
          <div className="brand-icon">
            <BrainCircuit size={24} />
          </div>

          <div>
            <h2>RE:KNOWLEDGE</h2>
            <span>INTELLIGENT HANDOVER</span>
          </div>

          <button
            className="mobile-close"
            onClick={() => setMobileMenu(false)}
            aria-label="Close menu"
          >
            <X size={19} />
          </button>
        </div>

        <div className="workspace-label">
          WORKSPACE
        </div>

        <nav className="sidebar-nav">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                className={`nav-item ${
                  activePage === item.label ? "active" : ""
                }`}
                onClick={() => {
                  setActivePage(item.label);
                  setMobileMenu(false);
                }}
              >
                <Icon size={19} />
                <span>{item.label}</span>

                {item.label === "Projects" && (
                  <span className="nav-count">
                    {projects.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">
              <CircleHelp size={20} />
            </div>

            <h4>Need help?</h4>
            <p>
              Learn how to preserve your team's knowledge.
            </p>

            <button
              onClick={() => setActivePage("Settings")}
            >
              Explore help <ArrowRight size={14} />
            </button>
          </div>

          <button
            className={`nav-item ${
              activePage === "Settings" ? "active" : ""
            }`}
            onClick={() => setActivePage("Settings")}
          >
            <Settings size={19} />
            <span>Settings</span>
          </button>

          <div className="profile">
            <div className="avatar">MM</div>

            <div className="profile-details">
              <strong>Mega M</strong>
              <span>Workspace Admin</span>
            </div>

            <MoreHorizontal
              size={20}
              className="profile-more"
            />
          </div>
        </div>
      </aside>

      {mobileMenu && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileMenu(false)}
        />
      )}

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="topbar">
          <button
            className="mobile-menu-button"
            onClick={() => setMobileMenu(true)}
            aria-label="Open menu"
          >
            <Menu size={21} />
          </button>

          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />{" "}
            <strong>{activePage}</strong>
          </div>

          <div className="topbar-actions">
            <div className="search-box">
              <Search size={17} />

              <input
                placeholder="Search projects..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setActivePage("Projects");
                }}
              />

              <kbd>⌘ K</kbd>
            </div>

            <div className="notification-wrapper">
              <button
                className="icon-button notification-button"
                onClick={() =>
                  setShowNotifications(!showNotifications)
                }
                aria-label="Notifications"
              >
                <Bell size={19} />
                <span className="notification-dot" />
              </button>

              {showNotifications && (
                <div className="notification-popover">
                  <h4>Notifications</h4>
                  <p>You are all caught up!</p>
                  <span>No new notifications.</span>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="page-container">
          {/* PAGE HEADING */}
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                KNOWLEDGE CONTINUITY PLATFORM
              </div>

              <h1>{currentTitle.title}</h1>
              <p>{currentTitle.subtitle}</p>
            </div>

            <div className="heading-actions">
              <button
                className="button button-secondary"
                onClick={() => {
                  setUploadError("");
                  setShowUpload(true);
                }}
              >
                <UploadCloud size={17} /> Upload files
              </button>

              <button
                className="button button-primary"
                onClick={generateReport}
              >
                <Sparkles size={17} /> Generate Handover
              </button>
            </div>
          </section>

          {/* OVERVIEW */}
          {activePage === "Overview" && (
            <>
              <section className="stats-grid">
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Total Projects</span>
                    <div className="stat-icon blue-bg">
                      <FolderKanban size={19} />
                    </div>
                  </div>

                  <div className="stat-value">
                    {projects.length}
                  </div>

                  <div className="stat-foot">
                    <span className="stat-neutral">
                      Your workspace
                    </span>
                    <span className="stat-foot-icon">
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-top">
                    <span>Knowledge Sources</span>
                    <div className="stat-icon purple-bg">
                      <FileText size={19} />
                    </div>
                  </div>

                  <div className="stat-value">
                    {totalFiles}
                  </div>

                  <div className="stat-foot">
                    <span className="stat-neutral">
                      Across all projects
                    </span>
                    <span className="stat-foot-icon">
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-top">
                    <span>Insights Identified</span>
                    <div className="stat-icon green-bg">
                      <BrainCircuit size={19} />
                    </div>
                  </div>

                  <div className="stat-value">
                    {analysisResult
                      ? analysisResult.decisions.length +
                        analysisResult.blockers.length +
                        analysisResult.risks.length
                      : 24}
                  </div>

                  <div className="stat-foot">
                    <span className="stat-positive">
                      <CheckCircle2 size={13} />
                      {analysisResult
                        ? "Backend results"
                        : "Demo insights"}
                    </span>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-top">
                    <span>Open Issues</span>
                    <div className="stat-icon orange-bg">
                      <AlertTriangle size={19} />
                    </div>
                  </div>

                  <div className="stat-value">
                    {analysisResult
                      ? String(
                          analysisResult.blockers.length +
                            analysisResult.risks.length
                        ).padStart(2, "0")
                      : "03"}
                  </div>

                  <div className="stat-foot">
                    <span className="stat-warning">
                      <AlertTriangle size={13} />
                      {analysisResult
                        ? "Backend results"
                        : "Requires review"}
                    </span>
                  </div>
                </div>
              </section>

              <section className="main-grid">
                <div className="panel projects-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Recent Projects</h2>
                      <p>
                        Your active knowledge workspaces
                      </p>
                    </div>

                    <button
                      className="text-button"
                      onClick={() =>
                        setActivePage("Projects")
                      }
                    >
                      View all <ArrowRight size={15} />
                    </button>
                  </div>

                  <div className="project-list">
                    {projects.slice(0, 3).map((project) => (
                      <div
                        className="project-item"
                        key={project.id}
                      >
                        <div
                          className={`project-symbol ${project.color}`}
                        >
                          <FolderKanban size={20} />
                        </div>

                        <div className="project-info">
                          <h3>{project.name}</h3>
                          <p>{project.description}</p>

                          <div className="progress-track">
                            <div
                              className="progress-fill"
                              style={{
                                width: `${project.progress}%`,
                              }}
                            />
                          </div>

                          <span className="progress-label">
                            {project.progress}% knowledge coverage
                          </span>
                        </div>

                        <div className="project-meta">
                          <span
                            className={`status-badge ${project.status.toLowerCase()}`}
                          >
                            {project.status}
                          </span>

                          <span className="project-updated">
                            <Clock3 size={12} />{" "}
                            {project.updated}
                          </span>

                          <button
                            className="small-icon-button"
                            onClick={() => {
                              setSelectedProject(project.name);
                              setAnalysisResult(null);
                              setAnalysisError("");
                              setActivePage("Handover Reports");
                            }}
                            aria-label="Open project"
                          >
                            <ArrowUpRight size={17} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    className="add-project-button"
                    onClick={addProject}
                  >
                    <Plus size={17} /> Create new project
                  </button>
                </div>

                <div className="panel activity-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Knowledge Activity</h2>
                      <p>Recent workspace activity</p>
                    </div>

                    <Activity
                      size={19}
                      className="muted-icon"
                    />
                  </div>

                  <div className="activity-list">
                    <div className="activity-item">
                      <div className="activity-marker blue-marker">
                        <UploadCloud size={15} />
                      </div>
                      <div>
                        <h4>Knowledge source uploaded</h4>
                        <p>
                          New documents added to workspace
                        </p>
                        <span>Recently</span>
                      </div>
                    </div>

                    <div className="activity-item">
                      <div className="activity-marker purple-marker">
                        <BrainCircuit size={15} />
                      </div>
                      <div>
                        <h4>Insights available</h4>
                        <p>
                          Review identified project findings
                        </p>
                        <span>Recently</span>
                      </div>
                    </div>

                    <div className="activity-item">
                      <div className="activity-marker green-marker">
                        <CheckCircle2 size={15} />
                      </div>
                      <div>
                        <h4>Workspace created</h4>
                        <p>
                          RE:KNOWLEDGE is ready to use
                        </p>
                        <span>Today</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="panel insights-panel">
                <div className="panel-heading">
                  <div>
                    <div className="heading-with-icon">
                      <div className="mini-ai-icon">
                        <Sparkles size={16} />
                      </div>
                      <h2>Knowledge Insights</h2>
                    </div>
                    <p>
                      Illustrative findings for the dashboard preview
                    </p>
                  </div>

                  <span className="demo-label">
                    DEMO DATA
                  </span>
                </div>

                {renderInsights()}
              </section>
            </>
          )}

          {/* PROJECTS */}
          {activePage === "Projects" && (
            <section className="panel full-panel">
              <div className="panel-heading">
                <div>
                  <h2>All Projects</h2>
                  <p>
                    {filteredProjects.length} projects found
                  </p>
                </div>

                <button
                  className="button button-primary"
                  onClick={addProject}
                >
                  <Plus size={16} /> New Project
                </button>
              </div>

              <div className="project-cards-grid">
                {filteredProjects.map((project) => (
                  <div
                    className="project-card"
                    key={project.id}
                  >
                    <div className="project-card-top">
                      <div
                        className={`project-symbol ${project.color}`}
                      >
                        <FolderKanban size={21} />
                      </div>

                      <span
                        className={`status-badge ${project.status.toLowerCase()}`}
                      >
                        {project.status}
                      </span>
                    </div>

                    <h3>{project.name}</h3>
                    <p>{project.description}</p>

                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${project.progress}%`,
                        }}
                      />
                    </div>

                    <div className="project-card-bottom">
                      <span>
                        {project.progress}% coverage
                      </span>
                      <span>{project.files + files.filter((file) => file.projectName === project.name).length} sources</span>
                    </div>

                    <button
                      className="project-open-button"
                      onClick={() => {
                        setSelectedProject(project.name);
                        setAnalysisResult(null);
                        setAnalysisError("");
                        setActivePage("Handover Reports");
                      }}
                    >
                      Open handover <ArrowRight size={15} />
                    </button>
                  </div>
                ))}

                {filteredProjects.length === 0 && (
                  <div className="empty-state">
                    <FolderKanban size={30} />
                    <h3>No matching projects</h3>
                    <p>Try another search term.</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* KNOWLEDGE SOURCES */}
          {activePage === "Knowledge Sources" && (
            <section className="panel full-panel">
              <div className="panel-heading">
                <div>
                  <h2>Uploaded Documents</h2>
                  <p>
                    Manage your workspace knowledge files
                  </p>
                </div>

                <button
                  className="button button-primary"
                  onClick={() => {
                    setUploadError("");
                    setShowUpload(true);
                  }}
                  disabled={isUploading}
                >
                  <UploadCloud size={17} /> Upload documents
                </button>
              </div>

              <div
                className="upload-dropzone"
                onClick={() => fileInput.current?.click()}
                onDragOver={(event) =>
                  event.preventDefault()
                }
                onDrop={handleDrop}
              >
                <div className="dropzone-icon">
                  <UploadCloud size={28} />
                </div>

                <h3>
                  {isUploading
                    ? "Uploading and extracting documents..."
                    : "Drop your knowledge files here"}
                </h3>

                <p>
                  Upload PDF, TXT, MD or DOCX documents
                </p>

                <span>
                  {isUploading
                    ? "Please wait"
                    : "Browse files"}
                </span>
              </div>

              {uploadError && (
                <div className="analysis-error">
                  <AlertTriangle size={17} />
                  <span>{uploadError}</span>
                </div>
              )}

              {isUploading && (
                <p className="analysis-loading">
                  <Activity size={15} />
                  Sending documents to FastAPI for text extraction...
                </p>
              )}

              <div className="file-list">
                {files.length === 0 ? (
                  <div className="empty-state">
                    <FileText size={30} />
                    <h3>No uploaded documents yet</h3>
                    <p>
                      Your extracted documents will appear here.
                    </p>
                  </div>
                ) : (
                  files.map((file) => (
                    <div
                      className="file-row"
                      key={file.id}
                    >
                      <div className="file-icon">
                        <FileText size={20} />
                      </div>

                      <div className="file-details">
                        <strong>{file.name}</strong>
                        <span>
                          {file.size} · {file.projectName}
                          {file.wordCount
                            ? ` · ${file.wordCount} words extracted`
                            : ""}
                        </span>
                      </div>

                      <span className="uploaded-status">
                        <CheckCircle2 size={14} />{" "}
                        {file.status}
                      </span>

                      <button
                        className="small-icon-button delete-button"
                        onClick={() => removeFile(file.id)}
                        aria-label="Remove file"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* DECISION TIMELINE */}
          {activePage === "Decision Timeline" && (
            <section className="panel full-panel">
              <div className="panel-heading">
                <div>
                  <h2>Project Decision History</h2>
                  <p>
                    Important events and knowledge milestones
                  </p>
                </div>

                <span className="demo-label">
                  DEMO DATA
                </span>
              </div>

              <div className="timeline">
                {[
                  [
                    "Project architecture established",
                    "Initial architecture and component structure documented.",
                    "Architecture",
                  ],
                  [
                    "Authentication dependency identified",
                    "Authentication module connected to the user database.",
                    "Technical decision",
                  ],
                  [
                    "API integration blocker identified",
                    "External API completion requires verification.",
                    "Unresolved issue",
                  ],
                  [
                    "Documentation review needed",
                    "Deployment instructions require additional detail.",
                    "Knowledge gap",
                  ],
                ].map((event, index) => (
                  <div
                    className="timeline-item"
                    key={index}
                  >
                    <div className="timeline-dot" />

                    <div className="timeline-card">
                      <span className="timeline-date">
                        {index === 0
                          ? "Project start"
                          : `Milestone ${index + 1}`}
                      </span>

                      <h3>{event[0]}</h3>
                      <p>{event[1]}</p>

                      <span className="timeline-tag">
                        {event[2]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* HANDOVER REPORTS */}
          {activePage === "Handover Reports" && (
            <section className="panel full-panel">
              <div className="panel-heading">
                <div>
                  <h2>Handover Workspace</h2>
                  <p>
                    Prepare knowledge-transfer reports for incoming members
                  </p>
                </div>

                <button
                  className="button button-primary"
                  onClick={generateReport}
                >
                  <Sparkles size={16} /> Generate Report
                </button>
              </div>

              <div className="handover-intro">
                <div className="handover-intro-icon">
                  <ShieldCheck size={29} />
                </div>

                <div>
                  <h3>
                    Preserve what your team knows.
                  </h3>
                  <p>
                    Select a project, collect its knowledge sources and
                    create a structured handover package for review.
                  </p>
                </div>
              </div>

              <label
                className="form-label"
                htmlFor="project-select"
              >
                Select project
              </label>

              <select
                id="project-select"
                className="project-select"
                value={selectedProject}
                onChange={(event) => {
                  setSelectedProject(event.target.value);
                  setAnalysisResult(null);
                  setAnalysisError("");
                  setUploadError("");
                }}
              >
                {projects.map((project) => (
                  <option
                    key={project.id}
                    value={project.name}
                  >
                    {project.name}
                  </option>
                ))}
              </select>

              {/* BACKEND ANALYSIS INTERFACE */}
              <div className="analysis-box">
                <div className="panel-heading">
                  <div>
                    <h2>Analyze Project Knowledge</h2>
                    <p>
                      Submit project information and extracted documents
                      to the RE:KNOWLEDGE analysis engine.
                    </p>
                  </div>

                  <BrainCircuit size={23} />
                </div>

                <textarea
                  className="analysis-textarea"
                  placeholder={`Enter your project knowledge here...

Example:

We decided to use React for the frontend.

The authentication system is currently blocked because the database connection is not implemented.

There is a risk that API integration will delay the project.

We decided to use FastAPI for the backend.

You can also upload PDF, DOCX, TXT or MD files. Their extracted text will automatically be included in the analysis.`}
                  value={analysisText}
                  onChange={(event) => {
                    setAnalysisText(event.target.value);
                    setAnalysisError("");
                  }}
                />

                <div className="uploaded-knowledge-info">
                  <FileText size={16} />

                  <span>
                    {projectFiles.length > 0
                      ? `${projectFiles.length} uploaded document(s) will be included automatically (${projectFiles.reduce(
                          (sum, file) =>
                            sum + (file.wordCount || 0),
                          0
                        )} extracted words).`
                      : "No documents uploaded for this project yet. You can analyze manually entered knowledge or upload documents."}
                  </span>
                </div>

                <button
                  className="button button-secondary"
                  onClick={() => {
                    setUploadError("");
                    setShowUpload(true);
                  }}
                  disabled={isUploading}
                >
                  <UploadCloud size={17} />
                  {isUploading
                    ? "Uploading..."
                    : "Upload project documents"}
                </button>

                {uploadError && (
                  <div className="analysis-error">
                    <AlertTriangle size={17} />
                    <span>{uploadError}</span>
                  </div>
                )}

                <div style={{ marginTop: "16px" }}>
                  <button
                    className="button button-primary"
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || isUploading}
                  >
                    <Sparkles size={17} />

                    {isAnalyzing
                      ? "Analyzing..."
                      : "Analyze Knowledge"}
                  </button>
                </div>

                {isAnalyzing && (
                  <p className="analysis-loading">
                    <Activity size={15} />
                    Sending project knowledge and extracted documents
                    to the backend...
                  </p>
                )}

                {analysisError && (
                  <div className="analysis-error">
                    <AlertTriangle size={17} />
                    <span>{analysisError}</span>
                  </div>
                )}

                {renderAnalysisResults()}
              </div>

              {/* HANDOVER CHECKLIST */}
              <div className="handover-checklist">
                <h3>Handover preparation</h3>

                <div>
                  <CheckCircle2 size={17} />
                  <span>
                    Project workspace available
                  </span>
                </div>

                <div>
                  {projectFiles.length > 0 ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    <Clock3 size={17} />
                  )}

                  <span>
                    {projectFiles.length > 0
                      ? `${projectFiles.length} document(s) uploaded and extracted`
                      : "Knowledge source upload — awaiting documents"}
                  </span>
                </div>

                <div>
                  {analysisResult ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    <Clock3 size={17} />
                  )}

                  <span>
                    {analysisResult
                      ? "Backend knowledge analysis completed"
                      : "Knowledge analysis — awaiting submission"}
                  </span>
                </div>

                <div>
                  <Clock3 size={17} />
                  <span>
                    Role-based approval — future development
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* SETTINGS */}
          {activePage === "Settings" && (
            <section className="panel full-panel">
              <div className="panel-heading">
                <div>
                  <h2>Workspace Settings</h2>
                  <p>
                    RE:KNOWLEDGE workspace information
                  </p>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <strong>Workspace name</strong>
                  <p>RE:KNOWLEDGE</p>
                </div>
                <span className="settings-value">
                  Active
                </span>
              </div>

              <div className="settings-row">
                <div>
                  <strong>Workspace owner</strong>
                  <p>Mega M</p>
                </div>
                <span className="settings-value">
                  Admin
                </span>
              </div>

              <div className="settings-row">
                <div>
                  <strong>Storage</strong>
                  <p>
                    Extracted document text is currently held in browser memory.
                  </p>
                </div>
                <span className="settings-value">
                  Temporary
                </span>
              </div>
            </section>
          )}

          <footer className="footer">
            <span>© 2026 RE:KNOWLEDGE</span>
            <span>
              Preserving knowledge. Empowering continuity.
            </span>
          </footer>
        </div>
      </main>

      {/* HIDDEN FILE INPUT */}
      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.txt,.md,.docx"
        multiple
        hidden
        onChange={handleUpload}
      />

      {/* UPLOAD MODAL */}
      {showUpload && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!isUploading) {
              setShowUpload(false);
            }
          }}
        >
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <h2>Upload Knowledge Sources</h2>
                <p>
                  Add documents to {selectedProject}.
                </p>
              </div>

              <button
                className="icon-button"
                onClick={() => setShowUpload(false)}
                aria-label="Close upload dialog"
                disabled={isUploading}
              >
                <X size={20} />
              </button>
            </div>

            <div
              className="upload-modal-area"
              onClick={() => {
                if (!isUploading) {
                  fileInput.current?.click();
                }
              }}
            >
              <UploadCloud size={35} />

              <h3>
                {isUploading
                  ? "Uploading documents..."
                  : "Select your documents"}
              </h3>

              <p>
                PDF, TXT, MD and DOCX files supported
              </p>

              <span>
                {isUploading
                  ? "Please wait..."
                  : "Choose files"}
              </span>
            </div>

            {uploadError && (
              <div className="analysis-error">
                <AlertTriangle size={17} />
                <span>{uploadError}</span>
              </div>
            )}

            <p className="modal-note">
              Documents are sent to your FastAPI backend for text
              extraction. Maximum file size: 10 MB per document.
              Extracted text is held in browser memory during this session.
            </p>
          </div>
        </div>
      )}

      {/* HANDOVER REPORT MODAL */}
      {showReport && (
        <div
          className="modal-backdrop"
          onClick={() => setShowReport(false)}
        >
          <div
            className="modal report-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <div className="report-kicker">
                  <Sparkles size={14} /> HANDOVER PREVIEW
                </div>

                <h2>Knowledge Handover Report</h2>
                <p>{selectedProject}</p>
              </div>

              <button
                className="icon-button"
                onClick={() => setShowReport(false)}
                aria-label="Close report"
              >
                <X size={20} />
              </button>
            </div>

            <div className="report-demo-warning">
              <AlertTriangle size={17} />

              {analysisResult
                ? "Backend keyword analysis — human verification required."
                : "No backend analysis yet — this is a report preview."}
            </div>

            <div className="report-section">
              <h3>1. Project overview</h3>
              <p>
                A structured knowledge handover for {selectedProject}.
                This report contains the available project information
                and analysis results.
              </p>
            </div>

            <div className="report-section">
              <h3>2. Available knowledge sources</h3>

              {projectFiles.length === 0 ? (
                <p>No documents uploaded yet.</p>
              ) : (
                projectFiles.map((file) => (
                  <div
                    className="report-file"
                    key={file.id}
                  >
                    <FileText size={15} />
                    {file.name}
                  </div>
                ))
              )}
            </div>

            <div className="report-section">
              <h3>3. Original project knowledge</h3>

              <p className="report-knowledge-text">
                {getProjectKnowledge() ||
                  "No project knowledge submitted yet."}
              </p>
            </div>

            <div className="report-section">
              <h3>4. Backend analysis results</h3>

              {analysisResult ? (
                renderAnalysisResults()
              ) : (
                <p>
                  No analysis available yet. Go to the Handover
                  Workspace and click Analyze Knowledge first.
                </p>
              )}
            </div>

            <div className="report-section">
              <h3>5. Human verification</h3>

              <label className="approval-checkbox">
                <input
                  type="checkbox"
                  checked={reportApproved}
                  onChange={(event) =>
                    setReportApproved(event.target.checked)
                  }
                />

                I have reviewed this report.
              </label>
            </div>

            <div className="report-actions">
              <button
                className="button button-secondary"
                onClick={downloadReport}
              >
                <Download size={16} />
                Download report
              </button>

              <button
                className="button button-primary"
                onClick={() => setShowReport(false)}
                disabled={!reportApproved}
              >
                <CheckCircle2 size={16} />
                Complete review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
