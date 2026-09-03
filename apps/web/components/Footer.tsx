export const Footer = () => {
    return (
        <footer className="footer bg-main-4 text-base-content text-colortext-1 p-10 mt-auto">
            <nav>
                <h6 className="footer-title text-colortext-1 opacity-90 font-semibold">Services</h6>
                <a className="link link-hover">Branding</a>
                <a className="link link-hover">Design</a>
                <a className="link link-hover">Marketing</a>
                <a className="link link-hover">Advertisement</a>
            </nav>
            <nav>
                <h6 className="footer-title text-colortext-1 opacity-90 font-semibold">Company</h6>
                <a className="link link-hover">About us</a>
                <a className="link link-hover">Contact</a>
                <a className="link link-hover">Jobs</a>
                <a className="link link-hover">Press kit</a>
            </nav>
            <nav>
                <h6 className="footer-title text-colortext-1 opacity-90 font-semibold">Legal</h6>
                <a className="link link-hover">Terms of use</a>
                <a className="link link-hover">Privacy policy</a>
                <a className="link link-hover">Cookie policy</a>
            </nav>
            <form>
                <h6 className="footer-title text-colortext-1 opacity-90 font-semibold">Newsletter</h6>
                <fieldset className="form-control w-80">
                    <label className="label">
                        <span className="label-text text-colortext-1">Enter your email address</span>
                    </label>
                    <div className="join">
                        <input
                            type="text"
                            placeholder="username@site.com"
                            className="input input-bordered join-item bg-main-1" />
                        <button className="btn btn-primary join-item bg-btn-primary-base hover:bg-btn-primary-hover text-black">Subscribe</button>
                    </div>
                </fieldset>
            </form>
        </footer>
    )
}
