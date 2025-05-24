export default function Footer() {
  return (
    <footer className="w-full py-8 border-t border-white/10 bg-transparent backdrop-blur">
      <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between text-xs text-text-secondary">
        <div className="mb-2 md:mb-0">© {new Date().getFullYear()} InScribe AI</div>
        <div className="flex gap-6">
          <a href="/privacy" className="hover:text-accent-primary transition">Privacy</a>
          <a href="/terms" className="hover:text-accent-primary transition">Terms</a>
          <a href="https://github.com/kaustubhsiriki" target="_blank" rel="noopener noreferrer" className="hover:text-accent-primary transition">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
