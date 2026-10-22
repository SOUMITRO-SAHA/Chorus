import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { MainLayout } from "@/components/layouts/main.layout";
import { SearchBar } from "@/components/search-bar";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { BrowserHome } from "@/features/browser-home/browser-home";
import { MusicPage } from "@/features/music/music-page";
import { SettingsPage } from "@/features/settings/settings-page";
import { ThemesPage } from "@/features/settings/themes-page";
import { SpotifyPage } from "@/features/spotify/spotify-page";
import { WatchPage } from "@/features/youtube/watch-page";
import { YouTubePage } from "@/features/youtube/youtube-page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import { HashRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";

/** Which route gets the header search bar, and where results land. */
const SEARCH_TARGETS: Record<string, string> = {
  "/youtube": "/youtube",
  "/music": "/music",
  "/spotify": "/spotify",
};

function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const target = SEARCH_TARGETS[location.pathname];
  const isHome = location.pathname === "/";
  const isWatch = /^\/youtube\/.+/.test(location.pathname);
  const isThemes = location.pathname === "/settings/themes";

  const searchBar = useMemo(
    () =>
      target
        ? (
          <SearchBar
            placeholder={target === "/spotify"
              ? "Search Spotify tracks…"
              : target === "/music"
              ? "Search songs…"
              : "Search videos…"}
            onSearch={(q) => navigate(`${target}?q=${encodeURIComponent(q)}`)}
          />
        )
        : null,
    [target, navigate],
  );

  const contentClassName = isWatch
    ? "space-y-4 px-0 py-0 sm:px-6 sm:py-6"
    : isHome
    ? "flex max-w-xl flex-col px-4 py-0 pt-6 pb-0 sm:px-4 sm:py-0"
    : location.pathname === "/music"
    ? "flex flex-col"
    : undefined;

  return (
    <MainLayout
      header={!isHome && (
        <AppHeader
          backTo={isThemes ? "/settings" : "/"}
          backLabel={isThemes ? "Back to settings" : "Go back to Chorus home"}
        >
          {searchBar}
        </AppHeader>
      )}
      nav={!isHome && <BottomNav />}
      contentClassName={contentClassName}
    >
      <Routes>
        <Route path="/" element={<BrowserHome />} />
        <Route path="/youtube" element={<YouTubePage />} />
        <Route path="/youtube/:videoId" element={<WatchPage />} />
        <Route path="/music" element={<MusicPage />} />
        <Route path="/spotify" element={<SpotifyPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/themes" element={<ThemesPage />} />
        <Route path="*" element={<BrowserHome />} />
      </Routes>
    </MainLayout>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <Shell />
        </HashRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
