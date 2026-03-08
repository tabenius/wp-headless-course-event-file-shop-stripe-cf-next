import React from "react";
import Link from "next/link";

const Footer = () => {
  const menuItemClass = "my-4";
  const menuItemLinkClass = "hover:underline";
  return (
    <footer className="bg-gray-800 text-white py-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <h3 className="text-lg font-semibold mb-4">Kurser &amp; sessioner</h3>
            <ul>
              <li className={menuItemClass}>
                <Link href="/kurser-events" className={menuItemLinkClass}>
                  Kurser &amp; Events
                </Link>
              </li>
              <li className={menuItemClass}>
                <Link href="/heartconnection-vip-24h-sanctuary" className={menuItemLinkClass}>
                  Karleksverkstad - relationsspa
                </Link>
              </li>
              <li className={menuItemClass}>
                <Link href="/kursen-rora-och-berora" className={menuItemLinkClass}>
                  Rora och berora
                </Link>
              </li>
              <li className={menuItemClass}>
                <Link href="/behandlingar" className={menuItemLinkClass}>
                  Tantrisk massage
                </Link>
              </li>
              <li className={menuItemClass}>
                <Link href="/bdsm-sessioner" className={menuItemLinkClass}>
                  Tantrickink
                </Link>
              </li>
              <li className={menuItemClass}>
                <Link href="/coachning-och-samtal-om-relationer-och-tantra" className={menuItemLinkClass}>
                  Tantric Talk &amp; Teachings
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">Mer</h3>
            <ul>
              <li className={menuItemClass}>
                <Link href="/om-sofia-cerne" className={menuItemLinkClass}>
                  Om Sofia
                </Link>
              </li>
              <li className={menuItemClass}>
                <Link href="/handbok-tantriskmassage" className={menuItemLinkClass}>
                  Boken Rora &amp; Berora
                </Link>
              </li>
              <li className={menuItemClass}>
                <Link href="/blog" className={menuItemLinkClass}>
                  Blog
                </Link>
              </li>
              <li className={menuItemClass}>
                <Link href="/relationsterapi-for-par" className={menuItemLinkClass}>
                  Utveckling for par
                </Link>
              </li>
              <li className={menuItemClass}>
                <Link href="https://www.xtas.nu/events/event/" className={menuItemLinkClass}>
                  Evenemang
                </Link>
              </li>
              <li className={menuItemClass}>
                <Link href="/shop" className={menuItemLinkClass}>
                  Butik
                </Link>
              </li>
              <li className={menuItemClass}>
                <Link href="/courses" className={menuItemLinkClass}>
                  Onlinekurser
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">Kontakt</h3>
            <ul>
              <li className={menuItemClass}>
                <a href="mailto:info@xtas.nu" className={menuItemLinkClass}>
                  info@xtas.nu
                </a>
              </li>
              <li className={menuItemClass}>
                <a href="tel:+46705274940" className={menuItemLinkClass}>
                  070-527 49 40
                </a>
              </li>
              <li className={menuItemClass}>
                <a href="https://www.instagram.com/sofias_academy/" target="_blank" rel="noopener noreferrer" className={menuItemLinkClass}>
                  Instagram
                </a>
              </li>
              <li className={menuItemClass}>
                <a href="https://www.facebook.com/sofiasacademyse/" target="_blank" rel="noopener noreferrer" className={menuItemLinkClass}>
                  Facebook
                </a>
              </li>
              <li className={menuItemClass}>
                <a href="https://www.linkedin.com/in/sofia-cerne-9318307/" target="_blank" rel="noopener noreferrer" className={menuItemLinkClass}>
                  LinkedIn
                </a>
              </li>
              <li className={menuItemClass}>
                <a href="https://www.youtube.com/channel/UCO4mK4N45rYnK4eUcS8hUDw" target="_blank" rel="noopener noreferrer" className={menuItemLinkClass}>
                  YouTube
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 text-center">
          <p>
            &copy; {new Date().getFullYear()} XTAS / Sofias Academy. Alla rattigheter forbehallna.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
