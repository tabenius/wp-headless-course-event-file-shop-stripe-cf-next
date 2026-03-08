import React from "react";
import Link from "next/link";
import site from "@/lib/site";

const Footer = () => {
  const menuItemClass = "my-1";
  const menuItemLinkClass = "hover:underline";
  return (
    <footer className="bg-[#fff1f1] text-[#1a1a1a] py-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {site.footerColumns.map((col) => (
            <div key={col.title}>
              <h3 className="text-lg font-semibold mb-4">{col.title}</h3>
              <ul>
                {col.links.map((link) => (
                  <li key={link.href} className={menuItemClass}>
                    <Link href={link.href} className={menuItemLinkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <h3 className="text-lg font-semibold mb-4">Kontakt</h3>
            <ul>
              <li className={menuItemClass}>
                <a href={`mailto:${site.contact.email}`} className={menuItemLinkClass}>
                  {site.contact.email}
                </a>
              </li>
              <li className={menuItemClass}>
                <a href={`tel:${site.contact.phone}`} className={menuItemLinkClass}>
                  {site.contact.phoneDisplay}
                </a>
              </li>
              {Object.entries(site.social).map(([name, url]) => (
                <li key={name} className={menuItemClass}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className={menuItemLinkClass}>
                    {name.charAt(0).toUpperCase() + name.slice(1)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-8 text-center">
          <p>
            &copy; {new Date().getFullYear()} {site.copyright}. Alla rättigheter förbehållna.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
