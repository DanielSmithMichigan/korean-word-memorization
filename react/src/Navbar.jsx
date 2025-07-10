import { Link, useLocation } from 'react-router-dom';

function Navbar() {
  const location = useLocation();
  const query = location.search; // includes the leading "?" if present

  return (
    <nav className="bg-gray-800 p-4">
      <div className="container mx-auto flex justify-between">
        <Link to={`/${query}`} className="text-white font-bold">Upload</Link>
        <Link to={`/quiz-setup${query}`} className="text-white font-bold">Quiz</Link>
        <Link to={`/extractor${query}`} className="text-white font-bold">Extractor</Link>
      </div>
    </nav>
  );
}

export default Navbar;