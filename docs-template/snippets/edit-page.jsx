export const EditPage = ({ editUrl, lastModified }) => {
  const formatDate = (isoString) => {
    if (!isoString) return null;
    try {
      const date = new Date(isoString);
      return date.toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return null;
    }
  };

  const formattedDate = formatDate(lastModified);

  return (
    <div className="pt-6 mt-6 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <a
          href={editUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary no-underline not-prose"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          Suggest changes to this page
        </a>
        {formattedDate && (
          <span className="text-sm text-gray-500 not-prose">
            Last updated: {formattedDate}
          </span>
        )}
      </div>
    </div>
  );
};
