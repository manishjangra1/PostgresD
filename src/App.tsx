import { Providers } from "./app/providers";
import { Shell } from "./components/layout/Shell";

function App() {
  return (
    <Providers>
      <Shell />
    </Providers>
  );
}

export default App;
